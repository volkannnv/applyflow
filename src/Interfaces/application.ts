export const stages = ['saved', 'applied', 'interview', 'offer', 'rejected'] as const;
export type Stage = (typeof stages)[number];
export interface Application {
  id: string;
  company: string;
  role: string;
  location: string;
  workType: 'Uzaktan' | 'Hibrit' | 'Ofiste';
  stage: Stage;
  date: string;
  interviewAt: string;
  url: string;
  notes: string;
  color: string;
}
export const labels: Record<Stage, string> = {
  saved: 'Kaydedilen',
  applied: 'Başvuruldu',
  interview: 'Mülakat',
  offer: 'Teklif',
  rejected: 'Olumsuz',
};
