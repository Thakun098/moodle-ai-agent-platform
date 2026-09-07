import type {
  ModelChatParams,
  ModelChatResult,
  ModelInfo,
} from "./types.js";

export interface ModelClient {
  chat(params: ModelChatParams): Promise<ModelChatResult>;
  listModels(): Promise<ModelInfo[]>;
  ping(): Promise<boolean>;
}
