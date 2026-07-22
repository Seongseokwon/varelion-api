export type GenerateTokenPayload = {
  id: string;
  email: string;
  userRole: string;
};

export type GenerateTokenResponse = {
  accessToken: string;
  refreshToken: string;
};
