export type PetID = {
  id: string;
  name: string;
  breed: string;
  gender: string;
  birthday: string;
  characteristics: string[];
  visualPrompt?: string;
  avatarUrl: string;
  characterSheetUrl: string;
  referencePhotoUrl?: string;
  createdAt: number;
};

export type InteractionVideo = {
  id: string;
  petId: string;
  sceneImageUrl: string;
  videoUrl: string; // This will be a placeholder for now, or a generated "cinemagraph"
  createdAt: number;
};
