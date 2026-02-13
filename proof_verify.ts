import { verifyKurier } from "./index";
import { CircuitDir } from "./types";
import { registerVk } from "./register_vk";
const inputs = {
  x: "3",
  y: "5",
  z: "24",
};
async function main() {
  await verifyKurier(CircuitDir.GAME, inputs);
}

main();
