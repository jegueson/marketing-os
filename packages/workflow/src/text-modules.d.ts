declare module "*.yaml" {
  const source: string;
  export default source;
}

declare module "*.json" {
  const value: unknown;
  export default value;
}
