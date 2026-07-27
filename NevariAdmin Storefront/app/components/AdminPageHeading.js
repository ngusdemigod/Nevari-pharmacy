export default function AdminPageHeading({ title, description = "" }) {
  return (
    <header className="admin-page-heading">
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  );
}
