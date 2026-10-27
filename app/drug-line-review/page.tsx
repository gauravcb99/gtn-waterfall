import type { Metadata } from "next";
import DrugLineReview from "@/components/drug-line-review/DrugLineReview";

export const metadata: Metadata = {
  title: "Drug Line Review (payer view)",
};

export default function DrugLineReviewPage() {
  return <DrugLineReview />;
}
