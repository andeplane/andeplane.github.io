import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/features/neural-operators/labs/lib/utils';

function Tabs({ className, orientation = 'horizontal', ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root {...props} orientation={orientation} data-slot="tabs" className={cn('lab-tabs', className)} />;
}
const tabsListVariants = cva('lab-tab-list', {
  variants: { variant: { default: 'lab-tab-list-default', line: 'lab-tab-list-line' } },
  defaultVariants: { variant: 'default' },
});
function TabsList({ className, variant = 'default', ...props }: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return <TabsPrimitive.List {...props} data-slot="tabs-list" data-variant={variant} className={cn(tabsListVariants({ variant }), className)} />;
}
function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return <TabsPrimitive.Tab {...props} data-slot="tabs-trigger" className={cn('lab-tab', className)} />;
}
function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel {...props} data-slot="tabs-content" className={cn('lab-tab-panel', className)} />;
}
export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
