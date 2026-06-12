import './globals.css';

export const metadata = {
  title: 'Panini FIFA World Cup 2026 – Sticker Tracker',
  description: 'Controle de figurinhas da Copa 2026',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
