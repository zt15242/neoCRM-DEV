import { memo } from 'react';
import type { AiModelItem } from '../../../shared/types';

// Input changes elsewhere in a form should not rebuild a gateway's entire catalog.
export const ModelOptions = memo(function ModelOptions({ models, showId = false }: {
  models: AiModelItem[];
  showId?: boolean;
}) {
  return models.map(model => <option key={model.id} value={model.id}>
    {model.name}{showId ? ` (${model.id})` : ''}
  </option>);
});
