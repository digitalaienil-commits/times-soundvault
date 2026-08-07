import { BrainCircuit, KeyRound, LibraryBig, WandSparkles } from "lucide-react";

export const foundationCapabilities = [
  {
    title: "Intelligent Library",
    description:
      "One considered home for uploaded and generated audio, built for precise discovery.",
    icon: LibraryBig,
  },
  {
    title: "AI Audio Analysis",
    description:
      "Future analysis will make mood, instrumentation and sonic character easier to understand.",
    icon: BrainCircuit,
  },
  {
    title: "Music & SFX Generation",
    description:
      "Structured creative briefs will help teams create purpose-built music and sound effects.",
    icon: WandSparkles,
  },
  {
    title: "Secure Internal Access",
    description:
      "Clear role boundaries keep sensitive operations with the people responsible for them.",
    icon: KeyRound,
  },
] as const;
