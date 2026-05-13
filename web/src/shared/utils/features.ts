import { store } from '@/store';

export function isEnabled(featureCode: string): boolean {
  const features = store.get('experimentalFeatures') ?? [];
  return features.includes(featureCode);
}

export function getAiProvider(): string {
  const features = store.get('experimentalFeatures') ?? [];
  const providerFeature = features.find(f => f.startsWith('ai_provider:'));
  return providerFeature ? providerFeature.replace('ai_provider:', '') : 'groq';
}
