import portrait from '@/assets/anders-hafreager.jpg'

export default function ProfilePortrait({ priority = false }: { priority?: boolean }) {
  return (
    <div className="personal-profile">
      <img
        className="personal-portrait"
        src={portrait}
        alt="Anders Hafreager"
        width={2000}
        height={3000}
        fetchPriority={priority ? 'high' : 'auto'}
      />
      <a
        className="personal-profile-badge"
        href="https://user-badge.committers.top/norway_public/andeplane"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src="https://user-badge.committers.top/norway_public/andeplane.svg"
          alt="andeplane's committers.top ranking for public contributions in Norway"
          width={341}
          height={20}
        />
      </a>
    </div>
  )
}
