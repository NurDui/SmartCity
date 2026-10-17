import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seruen · Ваш город. Ваше настроение.",
  description: "Городской помощник по прогулкам в Астане. Реальные места, погода, ваш ритм и прозрачные источники.",
  icons: { icon: "/seruen.svg", shortcut: "/seruen.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
