export interface Entry {
  id: string
  created_at: number
  type: 'symptom'
  name: string
  note: string | null
  severity: number | null
  coverage: string | null
  photos: string[] | null
  entry_date: string
  body_part: string | null
  body_side: string | null
  body_subpart: string | null
  location_label: string | null
}

export interface BodyPartInfo {
  part: string
  side: string | null
  subparts: string[]
  fromFace?: boolean
}

export const COVERAGE = ['Spot', 'Patchy', 'Localised', 'Widespread', 'Diffuse'] as const
export type CoverageLevel = typeof COVERAGE[number]

export const COVERAGE_BG: Record<string, string> = {
  Spot:       '#E3EFE8',
  Patchy:     '#D4EBC0',
  Localised:  '#FBF0E4',
  Widespread: '#FAD9B0',
  Diffuse:    '#FAEAEA',
}

export const COVERAGE_FG: Record<string, string> = {
  Spot:       '#3D6B4F',
  Patchy:     '#3A6B1A',
  Localised:  '#C4752A',
  Widespread: '#A05A10',
  Diffuse:    '#B83A3A',
}

export const BODY_PARTS: Record<string, { label: string; side: boolean; sub: string[] }> = {
  face:    { label: 'Face',    side: false, sub: ['Scalp','Forehead','Ear','Cheek','Nose','Lips','Chin','Jaw','Neck','Nape'] },
  chest:   { label: 'Chest',   side: false, sub: ['Upper chest','Lower chest','Ribs','Collarbone','Sternum'] },
  stomach: { label: 'Stomach', side: false, sub: ['Upper abdomen','Lower abdomen','Navel','Side (flank)'] },
  arm:     { label: 'Arm',     side: true,  sub: ['Shoulder','Upper arm','Elbow','Forearm','Wrist','Hand','Fingers','Thumb'] },
  leg:     { label: 'Leg',     side: true,  sub: ['Hip','Thigh','Knee','Shin','Calf','Ankle','Foot','Toes','Heel'] },
  back:    { label: 'Back',    side: false, sub: ['Upper back','Mid back','Lower back','Shoulder blade','Spine','Tailbone'] },
  bottom:  { label: 'Bottom',  side: true,  sub: ['Buttock','Groin','Perineum'] },
}
