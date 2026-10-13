import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import SelectNumberOnFocus from "@/components/SelectNumberOnFocus";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GTN Waterfall Modeler",
  description: "Medicaid Best Price Cascade Engine",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="font-poppins bg-cream text-ink antialiased">
        <SelectNumberOnFocus />
        {children}
      </body>
    </html>
  );
}
