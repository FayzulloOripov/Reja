import teardown from "./teardown";

// vitest globalSetup: the returned function runs once after all test files
export default function setup() {
  return teardown;
}
