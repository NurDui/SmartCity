import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://seruen-astana.connect550439.chatgpt.site"),
  title: "Seruen Astana · Ваш город. Ваше настроение.",
  description: "Городской помощник по прогулкам в Астане. Реальные места, погода, ваш ритм и прозрачные источники.",
  icons: { icon: "/seruen.svg", shortcut: "/seruen.svg" },
  openGraph: {title:"Seruen Astana",description:"Прогулки, кино и события Астаны под ваше настроение.",url:"https://seruen-astana.connect550439.chatgpt.site",siteName:"Seruen Astana",images:["/images/astana-esil.jpg"],type:"website"},
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
