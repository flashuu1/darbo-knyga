const base = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true } as const;
export const CalendarIcon = () => (<svg {...base}><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>);
export const PeopleIcon = () => (<svg {...base}><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19c.6-3.4 3-5 6-5s5.4 1.600 6 5" /><path d="M16 5.500a3 3 0 010 6M18 14.200c1.700.6 2.700 2.200 3 4.800" /></svg>);
export const GearIcon = () => (<svg {...base}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.500M12 18.500V21M3 12h2.500M18.500 12H21M5.600 5.600l1.800 1.800M16.600 16.600l1.800 1.800M5.600 18.400l1.800-1.800M16.600 7.400l1.800-1.800" /></svg>);
export const PlusIcon = () => (<svg {...base}><path d="M12 5v14M5 12h14" /></svg>);
export const ChevronIcon = () => (<svg {...base} width={14} height={14}><path d="M6 9l6 6 6-6" /></svg>);
