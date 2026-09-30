export default function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="emptyState"><strong>{title}</strong><p>{description}</p></div>
}
