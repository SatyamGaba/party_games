import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "title",
            "heading",
            "body",
            "control",
            "label",
            "caption",
            "stat",
          ],
        },
      ],
    },
  },
});
export function cn(...values: ClassValue[]) {
  return merge(clsx(values));
}
