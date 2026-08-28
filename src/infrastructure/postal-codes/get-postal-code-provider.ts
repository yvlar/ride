import type { PostalCodeProvider } from "@/domain/postal-codes/postal-code-provider";
import { createPostalCodeProvider } from "./create-postal-code-provider";

export function getPostalCodeProvider(): PostalCodeProvider | null {
  return createPostalCodeProvider();
}
