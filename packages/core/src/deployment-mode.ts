/** Runtime modes from ADR-0018. Cloud billing is not part of this package. */
export const deploymentModes = ["self_hosted", "cloud"] as const;

export type DeploymentMode = (typeof deploymentModes)[number];

export function isDeploymentMode(value: string): value is DeploymentMode {
  return deploymentModes.some((mode) => mode === value);
}
