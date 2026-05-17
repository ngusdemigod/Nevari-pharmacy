import "./globals.css";

export const metadata = {
  title: "Nevari Dashboard",
  description: "Nevari dashboard and pairing experience."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
