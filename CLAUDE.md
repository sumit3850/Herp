# HerpWatch: notes for future work

## Design preferences (from the owner)
- **No sidebars.** Navigation is a horizontal top bar on desktop and a bottom bar on phones.
- Keep the app simple and uncluttered: no repeated sections or duplicate stats.
- Look: neutral palette (white cards, light grey background, near-black primary), orange accent (#f97316) for charts and progress, Inter font.
- Checklists live under **Explore**, one per state / UT / district / island.
- Recording must be quick: **Start is one tap**; survey type, name, observers and weather are asked at the end (submission page).
- Forms show only the essentials (species, count, photos, notes); everything else goes under "More details".
- Taps must respond instantly: never wait for GPS before reacting; refine the position in the background.

## Privacy rules
- Every record belongs to the account that made it (`user_id` can't change; RLS: users see only their own rows).
- Unsent records on a shared phone are tagged with their owner and only upload for that account.
- Public pages show usernames only, never full names, e-mails or phone numbers.
