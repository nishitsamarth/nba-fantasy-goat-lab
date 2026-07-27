import type { Metadata } from "next";
import NbaLab from "./ui/NbaLab";

export const metadata: Metadata = {
  title: "NBA Fantasy GOAT Lab",
  description: "Draft five legendary NBA seasons and face the perfect lineup from the same spins.",
};

export default function Home() {
  return <NbaLab />;
}
