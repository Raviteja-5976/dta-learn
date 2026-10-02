import "server-only";
import { serverEnv } from "@/lib/env";
import { Judge0Provider } from "./judge0";
import { CompilerUnavailableError, type CompilerProvider } from "./types";

let provider: CompilerProvider | null = null;

/** The configured CompilerProvider. Swapping vendors is a change here only. */
export function getCompiler(): CompilerProvider {
  if (!serverEnv.judge0Configured()) throw new CompilerUnavailableError("The code runner is not configured. Set JUDGE0_URL.");
  if (!provider) {
    const { url, apiKey } = serverEnv.judge0();
    provider = new Judge0Provider(url, apiKey);
  }
  return provider;
}
