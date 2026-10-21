import type { ComponentType, SVGProps } from 'react'
import type { MessageKey } from '../i18n/index.ts'
import { BubbleIcon, LetterIcon, PotIcon } from '../components/Icons.tsx'

export interface Feature {
  path: string
  title: string
  taglineKey: MessageKey
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

/** The three product features. The home page cards and the navigation both come from this list. */
export const FEATURES: readonly Feature[] = [
  {
    path: '/legacy',
    title: 'Legacy',
    taglineKey: 'feature.legacy',
    Icon: LetterIcon,
  },
  {
    path: '/blind-pot',
    title: 'Blind Pot',
    taglineKey: 'feature.blindPot',
    Icon: PotIcon,
  },
  {
    path: '/unsigned',
    title: 'Unsigned',
    taglineKey: 'feature.unsigned',
    Icon: BubbleIcon,
  },
]
