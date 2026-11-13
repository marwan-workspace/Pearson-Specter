import { CONDITIONS } from './conditions';
import { SHELTER_RATE_USV_H } from './crew';
import { mentalSeries, openEvents, type MissionState } from './mission';
import type { Astronaut, ConditionId, Status } from './types';

/**
 * Body zones shown on the 3D suit. Each one lights up where the problem is: the heart turns coral for a
 * cardiac event, the lungs for low oxygen, and so on. The same list drives the buttons under the suit,
 * so everything the 3D view says is also available without it.
 */
export type ZoneId = 'heart' | 'lungs' | 'head' | 'circulation' | 'radiation';

export interface BodyZone {
  id: ZoneId;
  label: string;
  status: Status;
  /** The current reading, with its unit. null when the watch gives no signal. */
  value: string | null;
  /** One sentence on what is going on. */
  detail: string;
  /** Section of the astronaut record that explains it. */
  section: string;
}

const CARDIAC: ConditionId[] = ['tachycardia', 'bradycardia', 'shock', 'panic-attack'];
const PRESSURE: ConditionId[] = ['high-bp', 'low-bp', 'shock'];

export function bodyZones(s: MissionState, a: Astronaut): BodyZone[] {
  const v = s.vitals[a.id] ?? [];
  const last = v[v.length - 1];
  if (!last) return [];
  const fault = !!s.sensorFault[a.id];
  const b = a.baseline;
  const open = openEvents(s, a.id);
  const event = (ids: ConditionId[]) => open.find((e) => ids.includes(e.condition));
  const mh = mentalSeries(s, a.id).slice(-1)[0].score;
  const peak = Math.max(...v.slice(-288).map((x) => x.radiationRate));

  const cardiac = event(CARDIAC);
  const hrOff = Math.abs(last.heartRate - b.heartRate - last.activity * 78) > 25;
  const heart: BodyZone = fault
    ? { id: 'heart', label: 'Heart', status: 'watch', value: null, detail: 'The watch is loose, so there is no heart signal. This is a sensor fault, not a cardiac arrest.', section: 'vitals' }
    : {
        id: 'heart',
        label: 'Heart',
        status: cardiac || hrOff ? 'critical' : 'nominal',
        value: `${Math.round(last.heartRate)} bpm`,
        detail: cardiac ? `${CONDITIONS[cardiac.condition].label}. ${cardiac.evidence}.` : hrOff ? `Heart rate is far from the personal baseline of ${b.heartRate} bpm.` : `Within the personal baseline of ${b.heartRate} bpm${last.activity > 0.6 ? ', allowing for exercise' : ''}.`,
        section: 'vitals',
      };

  const oxy = event(['low-oxygen']);
  const lungs: BodyZone = fault
    ? { id: 'lungs', label: 'Lungs', status: 'watch', value: null, detail: 'The watch is loose, so there is no blood-oxygen signal.', section: 'vitals' }
    : {
        id: 'lungs',
        label: 'Lungs',
        status: oxy || last.spo2 < 90 ? 'critical' : last.spo2 < 93 ? 'watch' : 'nominal',
        value: `${Math.round(last.spo2)} %`,
        detail: oxy ? `${CONDITIONS[oxy.condition].label}. ${oxy.evidence}.` : last.spo2 < 93 ? `Blood oxygen is below the personal baseline of ${b.spo2} %.` : `Blood oxygen is at the personal baseline of ${b.spo2} %.`,
        section: 'vitals',
      };

  const fever = event(['fever']);
  const head: BodyZone = {
    id: 'head',
    label: 'Head',
    status: fever || last.temp > 38.2 ? 'critical' : last.temp > 38 || mh < 60 ? 'watch' : 'nominal',
    value: `${last.temp.toFixed(1)} °C`,
    detail: fever ? `${CONDITIONS[fever.condition].label}. ${fever.evidence}.` : last.temp > 38 ? 'Body temperature is raised.' : mh < 60 ? `Temperature is normal, but the mental-health score is ${mh} of 100.` : `Temperature is normal and the mental-health score is ${mh} of 100.`,
    section: fever || last.temp > 38 ? 'vitals' : 'mental',
  };

  const bp = event(PRESSURE);
  const drift = last.systolic - b.systolic > 12 && last.activity < 0.5;
  const circulation: BodyZone = {
    id: 'circulation',
    label: 'Blood pressure',
    status: bp ? 'critical' : last.systolic > 140 || last.systolic < 90 || drift ? 'watch' : 'nominal',
    value: `${Math.round(last.systolic)}/${Math.round(last.diastolic)} mmHg`,
    detail: bp ? `${CONDITIONS[bp.condition].label}. ${bp.evidence}.` : last.systolic > 140 ? 'Systolic pressure is above 140 mmHg.' : last.systolic < 90 ? 'Systolic pressure is below 90 mmHg.' : drift ? `Above the personal baseline of ${b.systolic}/${b.diastolic} mmHg.` : `At the personal baseline of ${b.systolic}/${b.diastolic} mmHg.`,
    section: 'vitals',
  };

  const rad = event(['radiation-sickness']);
  const radiation: BodyZone = {
    id: 'radiation',
    label: 'Radiation',
    status: rad || last.radiationRate > SHELTER_RATE_USV_H ? 'critical' : peak > SHELTER_RATE_USV_H ? 'watch' : 'nominal',
    value: `${Math.round(last.radiationRate)} µSv/h`,
    detail: rad ? `${CONDITIONS[rad.condition].label}. ${rad.evidence}.` : last.radiationRate > SHELTER_RATE_USV_H ? 'Above the take-shelter threshold. Move to the shielded area.' : peak > SHELTER_RATE_USV_H ? `Normal now, but the dose rate peaked at ${Math.round(peak)} µSv/h in the last 24 hours.` : `Background level. Take shelter above ${SHELTER_RATE_USV_H} µSv/h.`,
    section: 'radiation',
  };

  return [heart, lungs, head, circulation, radiation];
}
