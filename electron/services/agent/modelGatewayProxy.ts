import type { ModelGatewayClient, ModelRequest, ModelStreamEvent, ModelTextResult, WorkBuddyModelBridge } from './modelGatewayTypes';

/** Keep the complete provider SDK out of the main bundle; load it only for local fallback calls. */
let instance: Promise<typeof import('./modelGateway').modelGateway> | undefined;
const gateway = () => instance ??= import('./modelGateway').then(module => module.modelGateway);
export const modelGatewayProxy: ModelGatewayClient = {
  async *stream(request: ModelRequest, workbuddy?: WorkBuddyModelBridge): AsyncGenerator<ModelStreamEvent> {
    yield* (await gateway()).stream(request, workbuddy);
  },
  async generateText(request: ModelRequest, workbuddy?: WorkBuddyModelBridge): Promise<ModelTextResult> {
    return (await gateway()).generateText(request, workbuddy);
  },
  async dispose() { if (instance) await (await instance).dispose(); },
};
