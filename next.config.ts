import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next dev would otherwise append an agent-rules block, em dash included,
  // to CLAUDE.md whenever it detects Claude Code. The Next docs it points at
  // are readable at node_modules/next/dist/docs without the block.
  agentRules: false,
};

export default nextConfig;
