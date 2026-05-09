'use client'

// src/app/admin/CatalogTable.tsx
// Phase 5 — Admin-Katalog Client Component (ADMIN-01 bis ADMIN-04).
// Phase 10 — SC-4: Serverseitige Pagination refactored.
// Tabs + Suche + Pagination + Edit-Sheet + Archive/Delete/Retry-Actions.

import { useState, useRef, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { toast } from 'sonner'
import { MoreHorizontal, X } from 'lucide-react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

// --- Typen ---

type Part = {
  id: string
  name: string
  part_number: string | null
  project: string | null
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'archived'
  thumbnail_count: number
  created_at: string
}

type TabValue = 'all' | 'ready' | 'pending' | 'failed' | 'archived'

// --- Zod-Schema für Edit-Sheet (archived NICHT in Enum — nur via /archive-Route) ---

const editSchema = z.object({
  name: z.string().min(1, 'Bezeichnung ist erforderlich.').max(200),
  part_number: z.string().max(100).optional().or(z.literal('')),
  project: z.string().max(200).optional().or(z.literal('')),
  status: z.enum(['pending', 'processing', 'ready', 'failed']),
})

type EditValues = z.infer<typeof editSchema>

// --- Hilfsfunktionen ---

function StatusBadge({ status }: { status: Part['status'] }) {
  if (status === 'ready') {
    return (
      <Badge className="text-green-700 bg-green-50 border-green-200 hover:bg-green-50">
        Bereit
      </Badge>
    )
  }
  if (status === 'pending') {
    return <Badge variant="secondary">Ausstehend</Badge>
  }
  if (status === 'processing') {
    return (
      <Badge variant="outline" className="text-blue-600 border-blue-300">
        Wird verarbeitet…
      </Badge>
    )
  }
  if (status === 'failed') {
    return <Badge variant="destructive">Fehlgeschlagen</Badge>
  }
  if (status === 'archived') {
    return (
      <Badge variant="outline" className="text-muted-foreground border-border">
        Archiviert
      </Badge>
    )
  }
  return null
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(',', '')
}

// --- Konstanten ---

const ROWS_PER_PAGE = 20

// --- Hauptkomponente ---

export function CatalogTable() {
  const [parts, setParts] = useState<Part[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabValue>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [editPart, setEditPart] = useState<Part | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Part | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: '', part_number: '', project: '', status: 'pending' },
  })

  // --- Zentraler Fetch — wird bei Seiten-, Tab- und Suchwechsel aufgerufen ---

  const fetchParts = useCallback(
    async (page: number, tab: TabValue, search: string) => {
      setIsLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        limit: String(ROWS_PER_PAGE),
      })
      if (tab !== 'all') params.set('status', tab)
      if (search) params.set('search', search)
      try {
        const res = await fetch(`/api/parts?${params.toString()}`)
        if (!res.ok) throw new Error('Fetch failed')
        const data = await res.json()
        setParts(data.parts ?? [])
        setTotalCount(data.total_count ?? 0)
        setTotalPages(data.total_pages ?? 1)
      } catch {
        toast.error('Katalog konnte nicht geladen werden.')
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  // --- Re-Fetch bei Parameterwechsel (Seite, Tab, Suche) ---

  useEffect(() => {
    fetchParts(currentPage, activeTab, searchQuery)
  }, [currentPage, activeTab, searchQuery, fetchParts])

  // --- Thumbnail-Fetch (nur für ready-Parts, gecacht) ---

  useEffect(() => {
    parts
      .filter(p => p.status === 'ready' && !thumbnailUrls[p.id])
      .forEach(part => {
        fetch(`/api/parts/${part.id}/thumbnail`)
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            if (data?.url) {
              setThumbnailUrls(prev => ({ ...prev, [part.id]: data.url }))
            }
          })
          .catch(() => {
            // Kein Fehler-Toast bei Thumbnail — Skeleton bleibt sichtbar
          })
      })
    // thumbnailUrls aus Deps entfernen um Endlosschleife zu vermeiden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts])

  // --- Handler ---

  const handleTabChange = (value: string) => {
    setActiveTab(value as TabValue)
    setCurrentPage(1)
  }

  const handleSearchInput = (value: string) => {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value)
      setCurrentPage(1)
    }, 300)
  }

  const handleSearchClear = () => {
    setSearchInput('')
    setSearchQuery('')
    setCurrentPage(1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }

  const handleEdit = (part: Part) => {
    setEditPart(part)
    form.reset({
      name: part.name,
      part_number: part.part_number ?? '',
      project: part.project ?? '',
      status: part.status === 'archived' ? 'pending' : part.status,
    })
    setSheetOpen(true)
  }

  const handleSave = async (values: EditValues) => {
    if (!editPart) return
    // Optimistic update
    const updatedPart: Part = {
      ...editPart,
      name: values.name,
      part_number: values.part_number || null,
      project: values.project || null,
      status: values.status,
    }
    setParts(prev =>
      prev.map(p => (p.id === editPart.id ? updatedPart : p))
    )
    try {
      const res = await fetch(`/api/parts/${editPart.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          part_number: values.part_number || null,
          project: values.project || null,
          status: values.status,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      toast.success('Änderungen gespeichert.')
      // Sheet bleibt offen (D-09) — kein setSheetOpen(false)
    } catch {
      // Rollback
      setParts(prev => prev.map(p => (p.id === editPart.id ? editPart : p)))
      form.setError('root', {
        message: 'Speichern fehlgeschlagen. Bitte erneut versuchen.',
      })
    }
  }

  const handleArchive = async (id: string) => {
    const original = parts.find(p => p.id === id)
    if (!original) return
    setParts(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'archived' } : p))
    )
    try {
      const res = await fetch(`/api/parts/${id}/archive`, { method: 'POST' })
      if (!res.ok) throw new Error('Archive failed')
    } catch {
      setParts(prev => prev.map(p => (p.id === id ? original : p)))
      toast.error('Archivieren fehlgeschlagen. Bitte erneut versuchen.')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    const { id } = deleteTarget
    const backup = [...parts]
    setParts(prev => prev.filter(p => p.id !== id))
    setAlertOpen(false)
    setDeleteTarget(null)
    try {
      const res = await fetch(`/api/parts/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
    } catch {
      setParts(backup)
      toast.error('Löschen fehlgeschlagen. Bitte erneut versuchen.')
    }
  }

  const handleRetry = async (id: string) => {
    const original = parts.find(p => p.id === id)
    if (!original) return
    setParts(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'pending' } : p))
    )
    try {
      const res = await fetch(`/api/parts/${id}/retry`, { method: 'POST' })
      if (!res.ok) throw new Error('Retry failed')
    } catch {
      setParts(prev => prev.map(p => (p.id === id ? original : p)))
      toast.error('Neustart fehlgeschlagen. Bitte erneut versuchen.')
    }
  }

  // --- JSX ---

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Teile-Katalog</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/upload">+ Hochladen</Link>
        </Button>
      </div>

      {/* Tabs — ohne Tab-Counts (serverseitige Pagination: nur 20 Einträge geladen) */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="all">Alle</TabsTrigger>
          <TabsTrigger value="ready">Bereit</TabsTrigger>
          <TabsTrigger value="pending">Ausstehend</TabsTrigger>
          <TabsTrigger value="failed">Fehler</TabsTrigger>
          <TabsTrigger value="archived">Archiviert</TabsTrigger>
        </TabsList>

        {/* Suchfeld */}
        <div className="relative mt-4">
          <Input
            placeholder="Nach Bezeichnung oder Teilenummer suchen…"
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
            aria-label="Teile suchen"
            className="pr-8"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleSearchClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Suche zurücksetzen"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Tabelle */}
        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : parts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-lg font-semibold">Noch keine Bauteile vorhanden</p>
              <p className="text-sm text-muted-foreground mt-2">
                Lade eine STEP-Datei hoch, um mit dem Aufbau des Katalogs zu beginnen.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/upload">Erstes Bauteil hochladen</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Vorschau</TableHead>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead>Teilenummer</TableHead>
                  <TableHead>Projekt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Erstellt am</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map(part => (
                  <TableRow key={part.id}>
                    {/* Thumbnail */}
                    <TableCell>
                      {part.status === 'ready' && thumbnailUrls[part.id] ? (
                        <img
                          src={thumbnailUrls[part.id]}
                          alt={part.name}
                          width={48}
                          height={48}
                          loading="lazy"
                          className="object-contain rounded-sm border w-12 h-12"
                        />
                      ) : (
                        <Skeleton className="w-12 h-12 rounded-sm" />
                      )}
                    </TableCell>

                    {/* Bezeichnung */}
                    <TableCell className="font-semibold">{part.name}</TableCell>

                    {/* Teilenummer */}
                    <TableCell className="text-muted-foreground">
                      {part.part_number ?? '—'}
                    </TableCell>

                    {/* Projekt */}
                    <TableCell className="text-muted-foreground">
                      {part.project ?? '—'}
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <StatusBadge status={part.status} />
                    </TableCell>

                    {/* Erstellt am */}
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(part.created_at)}
                    </TableCell>

                    {/* Aktionen */}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Aktionen für ${part.name}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(part)}>
                            Bearbeiten
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleArchive(part.id)}>
                            Archivieren
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setDeleteTarget(part)
                              setAlertOpen(true)
                            }}
                          >
                            Löschen
                          </DropdownMenuItem>
                          {part.status === 'failed' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleRetry(part.id)}>
                                ↺ Neu starten
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination — fensterbasiert: max 5 Seitennummern um aktuelle Seite */}
        {totalPages > 1 && parts.length > 0 && (
          <div className="mt-4 space-y-2">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={e => { e.preventDefault(); if (currentPage > 1) setCurrentPage(p => p - 1) }}
                    aria-disabled={currentPage <= 1}
                    className={currentPage <= 1 ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>
                {/* Immer Seite 1 zeigen wenn weit genug weg */}
                {currentPage > 3 && (
                  <>
                    <PaginationItem>
                      <PaginationLink href="#" onClick={e => { e.preventDefault(); setCurrentPage(1) }}>1</PaginationLink>
                    </PaginationItem>
                    {currentPage > 4 && <PaginationItem><span className="px-2 text-muted-foreground">…</span></PaginationItem>}
                  </>
                )}
                {/* Fensterpages: max 5 um currentPage */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p >= Math.max(1, currentPage - 2) && p <= Math.min(totalPages, currentPage + 2))
                  .map(page => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href="#"
                        isActive={page === currentPage}
                        onClick={e => { e.preventDefault(); setCurrentPage(page) }}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                {/* Immer letzte Seite zeigen wenn weit genug weg */}
                {currentPage < totalPages - 2 && (
                  <>
                    {currentPage < totalPages - 3 && <PaginationItem><span className="px-2 text-muted-foreground">…</span></PaginationItem>}
                    <PaginationItem>
                      <PaginationLink href="#" onClick={e => { e.preventDefault(); setCurrentPage(totalPages) }}>{totalPages}</PaginationLink>
                    </PaginationItem>
                  </>
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={e => { e.preventDefault(); if (currentPage < totalPages) setCurrentPage(p => p + 1) }}
                    aria-disabled={currentPage >= totalPages}
                    className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
            <p className="text-xs text-muted-foreground text-center">
              Zeige {Math.min((currentPage - 1) * ROWS_PER_PAGE + 1, totalCount)}–{Math.min(currentPage * ROWS_PER_PAGE, totalCount)} von {totalCount} Teilen
            </p>
          </div>
        )}
      </Tabs>

      {/* Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Bauteil bearbeiten</SheetTitle>
          </SheetHeader>

          {/* Thumbnail im Sheet */}
          {editPart && (
            <div className="flex justify-center py-4">
              {editPart.status === 'ready' && thumbnailUrls[editPart.id] ? (
                <img
                  src={thumbnailUrls[editPart.id]}
                  alt={`Vorschau: ${editPart.name}`}
                  width={192}
                  height={192}
                  className="object-contain rounded-md border w-48 h-48"
                />
              ) : (
                <div className="relative w-48 h-48 flex items-center justify-center rounded-md border bg-muted">
                  <Skeleton className="w-48 h-48 rounded-md absolute inset-0" />
                  <p className="text-xs text-muted-foreground relative z-10">
                    Thumbnail wird verarbeitet…
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Formular */}
          {editPart && (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSave)}
                className="space-y-4 mt-2"
              >
                {/* Root-Fehler */}
                {form.formState.errors.root && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.root.message}
                  </p>
                )}

                {/* Bezeichnung */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bezeichnung</FormLabel>
                      <FormControl>
                        <Input placeholder="z. B. Flanschplatte 50mm" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Teilenummer */}
                <FormField
                  control={form.control}
                  name="part_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teilenummer</FormLabel>
                      <FormControl>
                        <Input placeholder="z. B. MFG-4711 (optional)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Projekt */}
                <FormField
                  control={form.control}
                  name="project"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Projekt</FormLabel>
                      <FormControl>
                        <Input placeholder="z. B. Getriebe-Revision 2026 (optional)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Status (kein archived — nur via /archive-Route) */}
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pending">Ausstehend</SelectItem>
                          <SelectItem value="processing">Wird verarbeitet</SelectItem>
                          <SelectItem value="ready">Bereit</SelectItem>
                          <SelectItem value="failed">Fehlgeschlagen</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Erstellt am (read-only) */}
                <div className="space-y-1">
                  <Label>Erstellt am</Label>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(editPart.created_at)}
                  </p>
                </div>

                <Separator />

                {/* Aktions-Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    Speichern
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSheetOpen(false)}
                  >
                    Abbrechen
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete AlertDialog */}
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bauteil unwiderruflich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieses Teil und alle zugehörigen Dateien werden permanent gelöscht. Fortfahren?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
