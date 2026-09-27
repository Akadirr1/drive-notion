export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <main
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
      }}
    >
      <p
        style={{
          color: "var(--color-ink-muted)",
          fontSize: "18px",
          fontWeight: 400,
        }}
      >
        Pano henüz hazır değil
      </p>
    </main>
  );
}
