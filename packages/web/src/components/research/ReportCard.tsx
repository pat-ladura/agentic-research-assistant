import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { ReportRenderer } from '@/components/research/ReportRenderer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Printer } from 'lucide-react';

interface ReportCardProps {
  content: string;
  title: string;
  documentTitle?: string;
}

export function ReportCard({ content, title, documentTitle }: ReportCardProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ documentTitle, contentRef: printRef });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Research Report</CardTitle>
        <Button
          variant="outline"
          className="cursor-pointer"
          size="sm"
          onClick={() => handlePrint()}
        >
          <Printer className="mr-1 h-4 w-4" />
          Print / Save PDF
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-125 pr-4">
          <div ref={printRef} style={{ padding: '20px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '24px' }}>{title}</h1>
            <ReportRenderer content={content} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
