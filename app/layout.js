import './globals.css';

export const metadata = {
  title: 'Panini FIFA World Cup 2026 – Sticker Tracker',
  description: 'Controle de figurinhas da Copa 2026',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/css/flag-icons.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
