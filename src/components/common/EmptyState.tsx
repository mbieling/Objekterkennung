import { ReactNode } from 'react';
import Link from 'next/link';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActionProps {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ActionProps;
  secondaryAction?: ActionProps;
  children?: ReactNode;
}

function ActionButton({ action, variant = 'default' }: { action: ActionProps; variant?: 'default' | 'outline' }) {
  if (action.href) {
    return (
      <Button variant={variant} asChild>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return <Button variant={variant} onClick={action.onClick}>{action.label}</Button>;
}

export default function EmptyState({ icon: Icon, title, description, action, secondaryAction, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 animate-fade-in">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">{description}</p>
      {(action || secondaryAction) && (
        <div className="flex flex-wrap gap-3 justify-center">
          {action && <ActionButton action={action} />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
        </div>
      )}
      {children}
    </div>
  );
}
