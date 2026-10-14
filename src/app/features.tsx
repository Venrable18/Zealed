import type { ComponentType, SVGProps } from 'react'
import { BubbleIcon, LetterIcon, PotIcon } from '../components/Icons.tsx'

export interface Feature {
  path: string
  title: string
  tagline: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

/** The three product features. The home page cards and the navigation both come from this list. */
export const FEATURES: readonly Feature[] = [
  {
    path: '/legacy',
    title: 'Legacy',
    tagline: 'Seal a letter and funds for someone, opened on a date or if you go silent.',
    Icon: LetterIcon,
  },
  {
    path: '/blind-pot',
    title: 'Blind Pot',
    tagline: 'A shared gift pot. The host sees the total, never who gave what.',
    Icon: PotIcon,
  },
  {
    path: '/unsigned',
    title: 'Unsigned',
    tagline: 'An anonymous contact line. Send a message, with money if you like.',
    Icon: BubbleIcon,
  },
]
