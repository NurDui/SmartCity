import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "qadam · Астана в вашем ритме",
  description: "Городской помощник по прогулкам в Астане. Реальные места, погода, ваш ритм и прозрачные источники.",
  icons: { icon: "/qadam.svg", shortcut: "/qadam.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
