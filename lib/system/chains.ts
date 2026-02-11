import * as chainsModule from "./chains.js";

type ChainStep = {
  agent_id: string;
  role: string;
  input_handoff_type: string;
  output_handoff_type: string;
  optional?: boolean;
};

export type SystemChain = {
  chain_id: string;
  name: string;
  purpose: string;
  notes: string;
  steps: ChainStep[];
};

const runtime = chainsModule as unknown as { SYSTEM_CHAINS: SystemChain[] };
const SYSTEM_CHAINS = runtime.SYSTEM_CHAINS || [];

export { SYSTEM_CHAINS };
export default SYSTEM_CHAINS;
