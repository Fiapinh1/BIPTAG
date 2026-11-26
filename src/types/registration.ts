export interface RegistrationFarm {
  id: string;
  name: string;
  nameKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisteredTag {
  id: string;
  farmId: string;
  tagNumber: string;
  animal: string;
  source: 'nfc' | 'bluetooth' | 'manual';
  createdAt: string;
  updatedAt: string;
  corrections: { tagNumber: string; animal: string; changedAt: string }[];
}
