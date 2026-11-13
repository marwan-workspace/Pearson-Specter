"""ML half of the watch: label each 60 s window rest / stress / exercise, and flag abnormal vitals.

Train:  python -m watch.detect [data_dir]     (data_dir defaults to raw/raw)
"""
import json
import math
import sys
from numbers import Real
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

HERE = Path(__file__).parent
FEATURES = ["hr_mean", "hr_std", "acc_std", "eda_mean", "eda_slope", "temp_mean"]
WEARABLE = ("wearable_stress_exercise/wearable-device-dataset-from-induced-stress-and-"
            "structured-exercise-sessions-1.0.1/Wearable_Dataset")
BAD = {("STRESS", "f07")}  # dock left on the wristband: HR and TEMP invalid (data_constraints.txt)


def _read(path):
    raw = pd.read_csv(path, header=None)
    if str(raw.iat[0, 0]).startswith("version https://git-lfs"):
        raise SystemExit(f"{path} is a Git LFS pointer, not data. Run `git lfs pull` or pass the real data folder.")
    return raw


def _signal(path):
    """Empatica file: row 0 = start time (UTC), row 1 = sample rate in Hz, then samples."""
    raw = _read(path)
    vals = raw.iloc[2:].astype(float)
    step = pd.to_timedelta(np.arange(len(vals)) / float(raw.iat[1, 0]), unit="s")
    return vals.set_axis(pd.Timestamp(raw.iat[0, 0]) + step)


def session_windows(folder):
    """One row of FEATURES per clock minute of a recording session."""
    hr, eda, temp = (_signal(folder / f"{n}.csv")[0] for n in ("HR", "EDA", "TEMP"))
    acc = np.sqrt((_signal(folder / "ACC.csv") ** 2).sum(axis=1))
    return pd.DataFrame({
        "hr_mean": hr.resample("60s").mean(),
        "hr_std": hr.resample("60s").std(),
        "acc_std": acc.resample("60s").std(),
        "eda_mean": eda.resample("60s").mean(),
        "eda_slope": eda.resample("60s").agg(lambda s: s.iloc[-1] - s.iloc[0] if len(s) else np.nan),
        "temp_mean": temp.resample("60s").mean(),
    }).dropna()


def training_table(data_dir):
    rows = []
    for protocol in ("STRESS", "AEROBIC", "ANAEROBIC"):
        for folder in sorted((Path(data_dir) / WEARABLE / protocol).iterdir()):
            if (protocol, folder.name) in BAD:
                continue
            w = session_windows(folder)
            if protocol == "STRESS":
                # shortcut: everything after the first tag counts as stress, including the rest
                # breaks between tasks; parse the stage tags if stress accuracy matters
                tags = folder / "tags.csv"
                first = pd.Timestamp(_read(tags).iat[0, 0]) if tags.stat().st_size else pd.Timestamp.max
                w["state"] = np.where(w.index < first, "rest", "stress")
            else:
                w["state"] = "exercise"
            w["subject"] = folder.name.split("_")[0]
            rows.append(w)
    return pd.concat(rows)


def train(data_dir):
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import GroupKFold, cross_val_score

    t = training_table(data_dir)
    model = RandomForestClassifier(n_estimators=100, max_depth=8, class_weight="balanced", random_state=0)
    # grouped by subject so the score is for people the model has never seen
    score = cross_val_score(model, t[FEATURES], t["state"], groups=t["subject"],
                            cv=GroupKFold(5), scoring="balanced_accuracy").mean()
    joblib.dump(model.fit(t[FEATURES], t["state"]), HERE / "model.joblib")

    rest_hr = t.loc[t["state"] == "rest", "hr_mean"]
    radiation = {}
    for body in ("iss", "moon", "mars"):
        rate = _read(Path(data_dir) / f"radiation/radiation_{body}.csv").iloc[1:, 2].astype(float)
        radiation[body] = round(float(rate.quantile(0.999)), 2)
    baselines = {
        "rest_hr_high": round(float(rest_hr.quantile(0.99)), 1),
        "radiation_high": radiation,
        "cv_balanced_accuracy": round(float(score), 3),
        "training_windows": t["state"].value_counts().to_dict(),
    }
    (HERE / "baselines.json").write_text(json.dumps(baselines, indent=2) + "\n")
    return baselines


def load():
    return joblib.load(HERE / "model.joblib"), json.loads((HERE / "baselines.json").read_text())


def classify(model, reading):
    row = pd.DataFrame([reading]).reindex(columns=FEATURES)
    return "unknown" if row.isna().any(axis=None) else str(model.predict(row)[0])


def flags(reading, baselines, thresholds):
    """Abnormal readings only. Which condition they mean is decided in decide.py."""
    r, t = reading, thresholds
    location = str(r.get("location", "")).lower()
    # a missing or NaN vital compares False against every limit, which would read as healthy
    if location not in baselines["radiation_high"] or any(
            not isinstance(r.get(k), Real) or not math.isfinite(r[k]) for k in ("hr_mean", "bp_sys", "radiation")):
        return ["sensor_fault"]
    checks = {
        "hr_low": r["hr_mean"] < t["hr_low"],
        "hr_high": r["hr_mean"] > baselines["rest_hr_high"],
        "bp_shock": r["bp_sys"] < t["bp_sys_shock"],
        "bp_low": t["bp_sys_shock"] <= r["bp_sys"] < t["bp_sys_low"],
        "bp_high": r["bp_sys"] > t["bp_sys_high"],
        "radiation_high": r["radiation"] > baselines["radiation_high"][location],
    }
    return [name for name, hit in checks.items() if hit]


if __name__ == "__main__":
    print(json.dumps(train(sys.argv[1] if len(sys.argv) > 1 else "raw/raw"), indent=2))
