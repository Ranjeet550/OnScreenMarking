import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { RotateCcw, Copy, Type, ZoomIn, ZoomOut, Check, X, Undo, Move, Trash2, FileText, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Edit3 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import message from '../services/messageService';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const PDFAnnotator = forwardRef(({ onAnnotationsChange, currentQuestionId, onNextQuestion, maxMarks, sections = [], pdfUrl, scriptId, readOnly, onToggleQp, isQpOpen, onTotalPagesChange, canAttemptQuestion }, ref) => {
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const panStateRef = useRef({ isPanning: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#FF0000');
  const [lineWidth, setLineWidth] = useState(2);
  const [selectedText, setSelectedText] = useState('');
  const canvasContextRef = useRef(null);
  const [imageSource, setImageSource] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [pdfPages, setPdfPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [showTextInput, setShowTextInput] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [selectedAnno, setSelectedAnno] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0 });
  const [currentPath, setCurrentPath] = useState([]);
  const [showMarkPopup, setShowMarkPopup] = useState(false);
  const [markInput, setMarkInput] = useState('');
  const [stepName, setStepName] = useState('');
  const [pendingAnno, setPendingAnno] = useState(null);
  const [isSkipped, setIsSkipped] = useState(false);
  const [loadingPdf, setLoadingLoadingPdf] = useState(false);
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);

  // Notify parent of total pages
  useEffect(() => {
    if (pdfPages.length > 0 && onTotalPagesChange) {
      onTotalPagesChange(pdfPages.length);
    }
  }, [pdfPages.length, onTotalPagesChange]);

  // Expose PDF generation and uploading to the parent component
  useImperativeHandle(ref, () => ({
    generateEvaluatedPdf: async (mId) => {
      try {
        if (pdfPages.length === 0) return "";
        
        const { jsPDF } = await import('jspdf');
        
        // Setup PDF with identical dimensions
        const pdf = new jsPDF({
          orientation: canvasSize.width > canvasSize.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvasSize.width, canvasSize.height]
        });

        for (let i = 0; i < pdfPages.length; i++) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvasSize.width;
          tempCanvas.height = canvasSize.height;
          const tempCtx = tempCanvas.getContext('2d');
          
          // Clear background
          tempCtx.fillStyle = '#ffffff';
          tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
          
          // Draw clean page image
          if (pdfPages[i]) {
            tempCtx.drawImage(pdfPages[i], 0, 0, tempCanvas.width, tempCanvas.height);
          }
          
          // Draw annotations at standard zoom scale of 1
          annotations
            .filter(anno => anno.page === undefined || anno.page === i)
            .forEach(anno => {
              drawAnnotation(tempCtx, anno, 1);
            });

          // Draw dynamic evaluation summary at top right of the front page (page index 0)
          if (i === 0) {
            drawSummaryStamp(tempCtx, 1);
          }

          const imgData = tempCanvas.toDataURL('image/jpeg', 0.95);
          
          if (i > 0) {
            pdf.addPage([canvasSize.width, canvasSize.height], canvasSize.width > canvasSize.height ? 'landscape' : 'portrait');
          }
          pdf.addImage(imgData, 'JPEG', 0, 0, canvasSize.width, canvasSize.height);
        }

        const pdfBlob = pdf.output('blob');
        const formData = new FormData();
        formData.append('file', pdfBlob, `evaluated_${scriptId}.pdf`);

        const token = sessionStorage.getItem('token');
        const uploadUrl = mId 
          ? `${import.meta.env.VITE_API_URL}/upload?markingId=${mId}`
          : `${import.meta.env.VITE_API_URL}/upload`;

        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        
        const uploadResult = await uploadResponse.json();
        return uploadResult.url || "";
      } catch (err) {
        console.error("Failed to generate evaluated PDF:", err);
        return "";
      }
    },
    getTotalPages: () => pdfPages.length,
    openMarkModalForQuestion: (qNo) => {
      const activeSectionName = sections.find(sec => 
        sec.questions?.some(q => q.questionNo === qNo)
      )?.name || (sections[0]?.name || '');

      const centerAnno = {
        type: 'tick',
        x: (canvasSize.width || 800) / 2,
        y: (canvasSize.height || 600) / 3,
        color: '#00AA00',
        lineWidth: 2,
        questionId: qNo,
        stepName: activeSectionName,
        page: currentPage,
        id: Date.now()
      };

      setPendingAnno(centerAnno);
      setShowMarkPopup(true);
      setMarkInput('');
      setStepName(activeSectionName);
      const cannotAttempt = canAttemptQuestion && !canAttemptQuestion(qNo);
      setIsSkipped(cannotAttempt);
    },
    syncAnnotations: () => {
      if (scriptId) {
        const saved = sessionStorage.getItem(`annotations_${scriptId}`);
        if (saved) {
          try {
            setAnnotations(JSON.parse(saved));
          } catch (e) {}
        }
      }
    }
  }));

  // Helper to fit zoom to container width (Shrink to Fit)
  const fitZoomToContainer = (pageWidth) => {
    setTimeout(() => {
      const container = canvasRef.current?.parentNode;
      if (container) {
        const containerWidth = container.clientWidth - 32; // subtract padding
        if (containerWidth > 0 && pageWidth > 0) {
          const fitZoom = Math.min(1, containerWidth / pageWidth);
          setZoom(parseFloat(fitZoom.toFixed(2)));
        }
      }
    }, 150);
  };

  // Helper to save annotations to storage
  const saveAnnotationsToStorage = (updatedAnnos) => {
    if (scriptId) {
      sessionStorage.setItem(`annotations_${scriptId}`, JSON.stringify(updatedAnnos));
    }
  };

  // Sync annotations from sessionStorage based on scriptId
  useEffect(() => {
    if (scriptId) {
      const saved = sessionStorage.getItem(`annotations_${scriptId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setAnnotations(parsed);
          onAnnotationsChange?.(parsed);
        } catch (e) {
          console.error("Failed to parse annotations from sessionStorage:", e);
        }
      } else {
        setAnnotations([]);
        onAnnotationsChange?.([]);
      }
      setSelectedAnno(null);
    }
  }, [scriptId]);

  // Global hotkeys
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnno) {
        const updated = annotations.filter(anno => anno.id !== selectedAnno.id);
        setAnnotations(updated);
        saveAnnotationsToStorage(updated);
        onAnnotationsChange?.(updated);
        setSelectedAnno(null);
      }
      
      if (e.key === 'ArrowLeft') {
        setCurrentPage(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentPage(prev => Math.min(pdfPages.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnno, annotations, pdfPages.length]);

  // Mouse Wheel Zooming
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      // Zoom unconditionally on wheel
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoom(prev => parseFloat(Math.min(prev + 0.1, 3.0).toFixed(1)));
      } else {
        setZoom(prev => parseFloat(Math.max(prev - 0.1, 0.2).toFixed(1)));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Auto-load PDF from URL
  useEffect(() => {
    if (pdfUrl) {
      loadPdfFromUrl(pdfUrl);
    }
  }, [pdfUrl]);

  const loadPdfFromUrl = async (url) => {
    try {
      setLoadingLoadingPdf(true);
      const token = sessionStorage.getItem('token');
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const arrayBuffer = await response.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;

        pages.push(canvas);
      }

      setPdfPages(pages);
      setCurrentPage(0);
      setImageSource(null);
      if (pages.length > 0) {
        setCanvasSize({ width: pages[0].width, height: pages[0].height });
        fitZoomToContainer(pages[0].width);
      }
    } catch (err) {
      console.error("Failed to load PDF:", err);
    } finally {
      setLoadingLoadingPdf(false);
    }
  };

  // Sync stepName to first section name when sections are loaded
  useEffect(() => {
    if (sections.length > 0 && !stepName) {
      setStepName(sections[0].name);
    }
  }, [sections]);

  // Redraw everything whenever relevant state changes
  useEffect(() => {
    redrawCanvas();
  }, [imageSource, zoom, canvasSize, pdfPages, currentPage, annotations, currentPath, selectedAnno, showTextInput, showMarkPopup]);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    canvasContextRef.current = context;

    // Set canvas size
    canvas.width = canvasSize.width * zoom;
    canvas.height = canvasSize.height * zoom;

    // Clear canvas
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw PDF page or image
    if (pdfPages.length > 0 && pdfPages[currentPage]) {
      context.drawImage(pdfPages[currentPage], 0, 0, canvas.width, canvas.height);
    } else if (imageSource) {
      context.drawImage(imageSource, 0, 0, canvas.width, canvas.height);
    } else {
      // Draw placeholder
      context.fillStyle = '#f0f0f0';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#999';
      context.font = '16px Arial';
      context.textAlign = 'center';
      context.fillText('Upload Answer Sheet Image or PDF', canvas.width / 2, canvas.height / 2 - 20);
      context.fillText('(JPG, PNG, PDF)', canvas.width / 2, canvas.height / 2 + 20);
      return;
    }

    // Draw all annotations for current page
    annotations.filter(anno => anno.page === undefined || anno.page === currentPage).forEach(anno => {
      drawAnnotation(context, anno);
    });

    // Highlight selected annotation when in move tool
    if (selectedAnno && tool === 'move' && (selectedAnno.page === undefined || selectedAnno.page === currentPage)) {
      context.strokeStyle = '#3b82f6';
      context.lineWidth = 1.5 * zoom;
      context.setLineDash([5 * zoom, 5 * zoom]);
      const px = selectedAnno.x !== undefined ? selectedAnno.x * zoom : (selectedAnno.points?.[0]?.x * zoom);
      const py = selectedAnno.y !== undefined ? selectedAnno.y * zoom : (selectedAnno.points?.[0]?.y * zoom);
      context.strokeRect(px - 15 * zoom, py - 15 * zoom, 30 * zoom, 30 * zoom);
      context.setLineDash([]);
    }

    // Draw current path if drawing
    if (currentPath.length > 1) {
      drawAnnotation(context, {
        type: 'pen',
        points: currentPath,
        color: color,
        lineWidth: lineWidth
      });
    }

    // Draw dynamic evaluation summary at top right of the front page (page index 0)
    if (currentPage === 0) {
      drawSummaryStamp(context, zoom);
    }
  };

  const drawSummaryStamp = (ctx, drawZoom) => {
    // Aggregate section-wise marks from current annotations
    const secTotals = {};
    sections.forEach(sec => {
      secTotals[sec.name] = 0;
    });
    
    annotations.forEach(anno => {
      if (anno.marks !== undefined && !anno.isSkipped) {
        const sName = anno.stepName || (sections[0]?.name || '');
        if (sName) {
          secTotals[sName] = (secTotals[sName] || 0) + (anno.marks || 0);
        }
      }
    });

    const grandTotal = Object.values(secTotals).reduce((sum, v) => sum + v, 0);

    ctx.save();
    const boxWidth = 220 * drawZoom;
    const boxHeight = (40 + (sections.length * 18) + 30) * drawZoom;
    const boxX = ctx.canvas.width - boxWidth - 30 * drawZoom;
    const boxY = 30 * drawZoom;

    // Translucent backing
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Double border effect
    ctx.strokeStyle = '#D32F2F'; // Rich Deep Red
    ctx.lineWidth = 3 * drawZoom;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    
    ctx.strokeStyle = '#FFCDD2';
    ctx.lineWidth = 1 * drawZoom;
    ctx.strokeRect(boxX + 3 * drawZoom, boxY + 3 * drawZoom, boxWidth - 6 * drawZoom, boxHeight - 6 * drawZoom);

    // Header text
    ctx.fillStyle = '#D32F2F';
    ctx.font = `bold ${12 * drawZoom}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('ON-SCREEN EVALUATION', boxX + boxWidth / 2, boxY + 20 * drawZoom);

    // Divider line
    ctx.beginPath();
    ctx.moveTo(boxX + 15 * drawZoom, boxY + 28 * drawZoom);
    ctx.lineTo(boxX + boxWidth - 15 * drawZoom, boxY + 28 * drawZoom);
    ctx.strokeStyle = '#D32F2F';
    ctx.lineWidth = 1 * drawZoom;
    ctx.stroke();

    // Draw section totals
    ctx.textAlign = 'left';
    ctx.fillStyle = '#333333';
    ctx.font = `${11 * drawZoom}px Arial`;
    let lineY = boxY + 45 * drawZoom;
    sections.forEach(sec => {
      const sTotal = secTotals[sec.name] || 0;
      ctx.fillText(`${sec.name}:`, boxX + 20 * drawZoom, lineY);
      ctx.textAlign = 'right';
      ctx.font = `bold ${11 * drawZoom}px Arial`;
      ctx.fillText(`${sTotal} Marks`, boxX + boxWidth - 20 * drawZoom, lineY);
      ctx.textAlign = 'left';
      ctx.font = `${11 * drawZoom}px Arial`;
      lineY += 18 * drawZoom;
    });

    // Divider line for grand total
    ctx.beginPath();
    ctx.moveTo(boxX + 15 * drawZoom, lineY - 4 * drawZoom);
    ctx.lineTo(boxX + boxWidth - 15 * drawZoom, lineY - 4 * drawZoom);
    ctx.strokeStyle = '#E0E0E0';
    ctx.stroke();

    // Draw grand total
    ctx.fillStyle = '#D32F2F';
    ctx.font = `bold ${13 * drawZoom}px Arial`;
    ctx.fillText('GRAND TOTAL:', boxX + 20 * drawZoom, lineY + 12 * drawZoom);
    ctx.textAlign = 'right';
    ctx.font = `bold ${14 * drawZoom}px Arial`;
    ctx.fillText(`${grandTotal} Marks`, boxX + boxWidth - 20 * drawZoom, lineY + 12 * drawZoom);

    ctx.restore();
  };

  const drawAnnotation = (ctx, anno, drawZoom = zoom) => {
    ctx.strokeStyle = anno.color;
    ctx.fillStyle = anno.color;
    ctx.lineWidth = anno.lineWidth * drawZoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
 
    switch (anno.type) {
      case 'tick':
        drawTick(ctx, anno.x * drawZoom, anno.y * drawZoom, (anno.lineWidth * 10) * drawZoom);
        break;
      case 'cross':
        drawCross(ctx, anno.x * drawZoom, anno.y * drawZoom, (anno.lineWidth * 10) * drawZoom);
        break;
      case 'text':
        ctx.font = `bold ${16 * drawZoom}px Arial`;
        ctx.fillText(anno.text, anno.x * drawZoom, anno.y * drawZoom);
        break;
      case 'blank_page':
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 4 * drawZoom;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(ctx.canvas.width, ctx.canvas.height);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.85)';
        ctx.font = `bold ${32 * drawZoom}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('BLANK PAGE', ctx.canvas.width / 2, ctx.canvas.height / 2);
        break;
    }
 
    // Draw question tag label for ANY annotation that has a questionId
    if (anno.questionId) {
      ctx.save();
      ctx.font = `bold ${11 * drawZoom}px Arial`;
      ctx.textBaseline = 'alphabetic';
      const isCorrect = anno.marks > 0;
      const isSkipped = anno.isSkipped;
      const themeColor = isSkipped ? '#FF8C00' : (isCorrect ? '#008000' : '#FF0000');

      const markStr = anno.marks !== undefined
        ? (isSkipped ? '(Skip) ' : `(${anno.marks}) `)
        : '';
      const qNo = !isNaN(anno.questionId) && Number(anno.questionId) < 10 ? '0' + anno.questionId : anno.questionId;
      const secLabel = anno.stepName ? ` | ${anno.stepName}` : '';
      const label = `${markStr}Q${qNo}${secLabel}`;

      const px = anno.x ? anno.x * drawZoom : (anno.points?.[0]?.x * drawZoom);
      const py = anno.y ? anno.y * drawZoom : (anno.points?.[0]?.y * drawZoom);

      // For tick/cross, draw the label BELOW the symbol so it never overlaps the mark
      const isTickOrCross = anno.type === 'tick' || anno.type === 'cross';
      const labelY = isTickOrCross ? py + 26 * drawZoom : py - 10 * drawZoom;
      const pillY  = isTickOrCross ? py + 8  * drawZoom : py - 24 * drawZoom;

      const metrics = ctx.measureText(label);
      const pillW = metrics.width + 8 * drawZoom;
      const pillH = 18 * drawZoom;

      // Pill background
      ctx.fillStyle = isSkipped
        ? 'rgba(255,140,0,0.12)'
        : (isCorrect ? 'rgba(0,128,0,0.1)' : 'rgba(255,0,0,0.1)');
      ctx.fillRect(px - 4 * drawZoom, pillY, pillW, pillH);

      // Pill border
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 1 * drawZoom;
      ctx.strokeRect(px - 4 * drawZoom, pillY, pillW, pillH);

      // Label text
      ctx.fillStyle = themeColor;
      ctx.fillText(label, px, labelY);
      ctx.restore();
    }

    // For tick and cross: draw a circle badge showing the marks number (top-right of the symbol)
    if ((anno.type === 'tick' || anno.type === 'cross') && anno.marks !== undefined) {
      ctx.save();
      const px = anno.x ? anno.x * drawZoom : (anno.points?.[0]?.x * drawZoom);
      const py = anno.y ? anno.y * drawZoom : (anno.points?.[0]?.y * drawZoom);
      const isCorrect = anno.type === 'tick' || (anno.marks > 0);
      const themeColor = anno.isSkipped ? '#FF8C00' : (isCorrect ? '#008000' : '#FF0000');

      const cx = px + 26 * drawZoom;
      const cy = py - 4 * drawZoom;
      const radius = 11 * drawZoom;

      // White backing
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      // Circle border
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 1.8 * drawZoom;
      ctx.stroke();

      // Marks number or "S" for skipped
      ctx.font = `bold ${10 * drawZoom}px Arial`;
      ctx.fillStyle = themeColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(anno.isSkipped ? 'S' : String(anno.marks), cx, cy);
      ctx.restore();
    }
  };

  const drawTick = (ctx, x, y, size) => {
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x - size / 3, y + size);
    ctx.lineTo(x + size, y - size);
    ctx.stroke();
  };

  const drawCross = (ctx, x, y, size) => {
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.stroke();
  };


  const startDrawing = (e) => {
    if (!canvasRef.current || readOnly) return;
    if (e.button !== 0) return; // Ignore right-clicks and middle-clicks
    
    // Determine active question (only required for pen mode)
    const activeQId = currentQuestionId || sections[0]?.questions?.[0]?.questionNo;
    if (!activeQId && tool === 'pen') {
      message.warning("Please select a question from the right panel before you begin marking or annotating!");
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    if (tool === 'move') {
      // Find item to drag
      const item = [...annotations].reverse().find(anno => {
        if (anno.page !== undefined && anno.page !== currentPage) return false;
        if (anno.x !== undefined) {
          const dist = Math.sqrt(Math.pow(anno.x - x, 2) + Math.pow(anno.y - y, 2));
          return dist < 30;
        }
        if (anno.points) {
          return anno.points.some(p => Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2)) < 20);
        }
        return false;
      });

      if (item) {
        setIsDragging(true);
        setDraggedItem({ ...item, originalIndex: annotations.indexOf(item), offsetX: (item.x || item.points?.[0]?.x) - x, offsetY: (item.y || item.points?.[0]?.y) - y });
        setSelectedAnno(item);
      } else {
        setSelectedAnno(null);
        // Pan the canvas
        const container = canvasContainerRef.current;
        if (container) {
          panStateRef.current = {
            isPanning: true,
            startX: e.clientX,
            startY: e.clientY,
            scrollLeft: container.scrollLeft,
            scrollTop: container.scrollTop
          };
        }
      }
      return;
    }

    if (tool === 'text') {
      setTextPosition({ x, y });
      setShowTextInput(true);
      setTool('move'); // Switch back to select/move mode immediately
      return;
    }

    if (tool === 'pen') {
      setIsDrawing(true);
      setCurrentPath([{ x, y }]);
      return;
    }

    // Direct Tick and Cross tools: DO NOT attach question no or section with them!
    if (tool === 'tick' || tool === 'cross') {
      const directAnno = {
        type: tool,
        x, y,
        color: tool === 'tick' ? '#00AA00' : '#FF0000',
        lineWidth: 2,
        page: currentPage,
        id: Date.now()
      };
      const updated = [...annotations, directAnno];
      setAnnotations(updated);
      saveAnnotationsToStorage(updated);
      onAnnotationsChange?.(updated);
      return;
    }

    // Other tools (pen path drawn in draw/stopDrawing, handled above)
  };

  const draw = (e) => {
    if (panStateRef.current.isPanning) {
      const container = canvasContainerRef.current;
      if (container) {
        const dx = e.clientX - panStateRef.current.startX;
        const dy = e.clientY - panStateRef.current.startY;
        container.scrollLeft = panStateRef.current.scrollLeft - dx;
        container.scrollTop = panStateRef.current.scrollTop - dy;
      }
      return;
    }

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    if (isDragging && draggedItem) {
      const updated = [...annotations];
      const item = updated[draggedItem.originalIndex];
      if (item.x !== undefined) {
        item.x = x + draggedItem.offsetX;
        item.y = y + draggedItem.offsetY;
      } else if (item.points) {
        const dx = x + draggedItem.offsetX - item.points[0].x;
        const dy = y + draggedItem.offsetY - item.points[0].y;
        item.points = item.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      }
      setAnnotations(updated);
      return;
    }

    if (!isDrawing || tool !== 'pen') return;
    setCurrentPath(prev => [...prev, { x, y }]);
  };

  const stopDrawing = () => {
    if (panStateRef.current.isPanning) {
      panStateRef.current.isPanning = false;
      return;
    }

    if (isDragging) {
      setIsDragging(false);
      setDraggedItem(null);
      saveAnnotationsToStorage(annotations);
      onAnnotationsChange?.(annotations);
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentPath.length > 1) {
      const newAnno = {
        type: 'pen',
        points: currentPath,
        color,
        lineWidth,
        questionId: currentQuestionId,
        page: currentPage,
        id: Date.now()
      };
      const updated = [...annotations, newAnno];
      setAnnotations(updated);
      saveAnnotationsToStorage(updated);
      onAnnotationsChange?.(updated);
    }
    setCurrentPath([]);
  };
  const handleUndo = () => {
    const updated = annotations.slice(0, -1);
    setAnnotations(updated);
    saveAnnotationsToStorage(updated);
    onAnnotationsChange?.(updated);
    setSelectedAnno(null);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canvasRef.current || readOnly) return;
    
    // Find active question number (currentQuestionId or first question in any section)
    let activeQId = currentQuestionId;
    if (!activeQId) {
      for (const sec of sections) {
        if (sec.questions && sec.questions.length > 0) {
          activeQId = sec.questions[0].questionNo;
          break;
        }
      }
    }

    if (!activeQId) {
      message.warning("Please select a question from the right panel before you begin marking or annotating!");
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / zoom;
    const rawY = (e.clientY - rect.top) / zoom;
    const x = Math.max(10, Math.min((canvasSize.width || 800) - 20, rawX));
    const y = Math.max(10, Math.min((canvasSize.height || 600) - 20, rawY));

    const activeSectionName = sections.find(sec => 
      sec.questions?.some(q => q.questionNo === activeQId)
    )?.name || (sections[0]?.name || '');

    const newAnno = {
      type: 'tick',
      x, y,
      color: '#00AA00',
      lineWidth: 2,
      questionId: activeQId,
      stepName: activeSectionName,
      page: currentPage,
      id: Date.now()
    };
    
    setPendingAnno(newAnno);
    setShowMarkPopup(true);
    setMarkInput('');
    setStepName(activeSectionName);
    setIsSkipped(false);
  };

  const getMarkOptions = () => {
    const options = [0];
    const max = maxMarks || 10;
    for (let i = 0.5; i <= max; i += 0.5) {
      options.push(i);
    }
    return options;
  };

  const submitMark = () => {
    if (pendingAnno) {
      const finalMark = parseFloat(markInput) || 0;
      if (finalMark > 0 && !isSkipped && canAttemptQuestion && !canAttemptQuestion(pendingAnno.questionId)) {
        message.warning("Section attempt limit reached! You can mark this question as skipped.");
        return;
      }
      const finalAnno = { 
        ...pendingAnno, 
        marks: finalMark,
        stepName: stepName,
        isSkipped: isSkipped,
        type: isSkipped ? 'cross' : (finalMark > 0 ? 'tick' : 'cross'),
        color: isSkipped ? '#FF6B6B' : (finalMark > 0 ? '#00AA00' : '#FF0000')
      };
      const updated = [...annotations, finalAnno];
      setAnnotations(updated);
      saveAnnotationsToStorage(updated);
      onAnnotationsChange?.(updated);
      setPendingAnno(null);
      setShowMarkPopup(false);
      setMarkInput('');
      setIsSkipped(false);
      
      // Auto advance to next question if successful
      if (onNextQuestion) {
        onNextQuestion();
      }
    }
  };

  const clearCanvas = () => {
    setAnnotations([]);
    saveAnnotationsToStorage([]);
    onAnnotationsChange?.([]);
    setSelectedAnno(null);
  };

  const addTextAnnotation = () => {
    if (!textInput.trim()) return;
    
    const newAnno = {
      type: 'text',
      text: textInput,
      x: textPosition.x,
      y: textPosition.y,
      color,
      lineWidth,
      questionId: currentQuestionId,
      page: currentPage,
      id: Date.now()
    };
    
    const updated = [...annotations, newAnno];
    setAnnotations(updated);
    saveAnnotationsToStorage(updated);
    onAnnotationsChange?.(updated);
    
    setTextInput('');
    setShowTextInput(false);
  };

  const handleCopy = () => {
    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
      message.success('Text copied to clipboard!');
    }
  };

  const handleTextSelection = (e) => {
    const selected = window.getSelection().toString();
    if (selected) {
      setSelectedText(selected);
    }
  };

  const isToolDisabled = readOnly;

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* Top minimal status bar */}
      <div className="bg-white px-3 py-1.5 border-b border-gray-200 flex justify-between items-center text-xs shrink-0 shadow-sm z-10">
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setIsToolbarOpen(!isToolbarOpen)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded font-semibold transition-all border cursor-pointer ${
              isToolbarOpen 
                ? 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100' 
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
            title={isToolbarOpen ? "Collapse Tools Panel" : "Open Tools Panel"}
          >
            <Edit3 size={13} className="text-teal-600" />
            <span className="text-[11px]">Annotation Tools</span>
            {isToolbarOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
          </button>

          {onToggleQp && (
            <button
              type="button"
              onClick={onToggleQp}
              className={`flex items-center gap-1 px-2.5 py-1 rounded font-semibold transition-all border cursor-pointer ${
                isQpOpen 
                  ? 'bg-teal-700 text-white border-teal-800 hover:bg-teal-800' 
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
              }`}
              title={isQpOpen ? "Hide Question Paper" : "Show Question Paper"}
            >
              <FileText size={13} className={isQpOpen ? "text-white" : "text-teal-600"} />
              <span className="text-[11px]">{isQpOpen ? "Hide QP" : "Show QP"}</span>
            </button>
          )}

          <div className="h-4 w-px bg-gray-200" />
          <span className="font-semibold text-gray-500 uppercase tracking-wider text-[11px]">Evaluating:</span>
          <span className="font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-100 text-xs">
            Q{currentQuestionId || "—"}
          </span>
        </div>

        {/* Zoom controls in top status bar */}
        <div className="flex items-center gap-1.5">
          <button 
            onClick={() => setZoom(Math.max(0.2, zoom - 0.1))} 
            className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <input 
            type="range" 
            min="0.2" 
            max="3.0" 
            step="0.1" 
            value={zoom} 
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-20 accent-teal-600 cursor-pointer h-1.5"
          />
          <span className="w-10 text-center font-bold text-gray-700 text-xs">{Math.round(zoom * 100)}%</span>
          <button 
            onClick={() => setZoom(Math.min(3.0, zoom + 0.1))} 
            className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      {/* Main Workspace Area: Left Tools Panel + Canvas */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT SIDE DROPDOWN / DRAWER PANEL */}
        <div 
          className={`bg-white border-r border-gray-200 flex flex-col justify-between p-2 z-20 shadow-md transition-all duration-200 ease-in-out shrink-0 select-none ${
            isToolbarOpen ? 'w-14 sm:w-16' : 'w-0 p-0 border-r-0 overflow-hidden'
          }`}
        >
          {isToolbarOpen && (
            <div className="flex flex-col items-center gap-2 w-full">
              {/* Tool: Move / Select */}
              <button
                onClick={() => setTool('move')}
                disabled={isToolDisabled}
                className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  tool === 'move' ? 'bg-teal-700 text-white shadow-sm ring-2 ring-teal-400' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title="Select & Move"
              >
                <Move size={17} />
                <span className="text-[9px] font-bold mt-0.5">Move</span>
              </button>

              {/* Tool: Tick */}
              <button
                onClick={() => setTool('tick')}
                disabled={isToolDisabled}
                className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  tool === 'tick' ? 'bg-green-700 text-white shadow-sm ring-2 ring-green-400' : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                }`}
                title="Tick (Correct)"
              >
                <Check size={18} />
                <span className="text-[9px] font-bold mt-0.5">Tick</span>
              </button>

              {/* Tool: Cross */}
              <button
                onClick={() => setTool('cross')}
                disabled={isToolDisabled}
                className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  tool === 'cross' ? 'bg-red-700 text-white shadow-sm ring-2 ring-red-400' : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                }`}
                title="Cross (Incorrect)"
              >
                <X size={18} />
                <span className="text-[9px] font-bold mt-0.5">Cross</span>
              </button>

              {/* Tool: Text */}
              <button
                onClick={() => setTool('text')}
                disabled={isToolDisabled}
                className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  tool === 'text' ? 'bg-teal-700 text-white shadow-sm ring-2 ring-teal-400' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title="Text Feedback"
              >
                <Type size={17} />
                <span className="text-[9px] font-bold mt-0.5">Text</span>
              </button>

              <div className="w-8 h-px bg-gray-200 my-1" />

              {/* Undo */}
              <button
                onClick={handleUndo}
                disabled={annotations.length === 0 || readOnly}
                className="w-10 h-9 flex flex-col items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 transition-colors"
                title="Undo last annotation"
              >
                <Undo size={15} />
                <span className="text-[8px] font-bold">Undo</span>
              </button>

              {/* Blank Page Toggle */}
              <button
                onClick={() => {
                  const hasBlank = annotations.some(anno => anno.type === 'blank_page' && anno.page === currentPage);
                  let updated;
                  if (hasBlank) {
                    updated = annotations.filter(anno => !(anno.type === 'blank_page' && anno.page === currentPage));
                  } else {
                    updated = [...annotations, {
                      type: 'blank_page',
                      page: currentPage,
                      color: '#FF0000',
                      lineWidth: 3,
                      id: Date.now()
                    }];
                  }
                  setAnnotations(updated);
                  saveAnnotationsToStorage(updated);
                  onAnnotationsChange?.(updated);
                }}
                disabled={readOnly}
                className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  annotations.some(anno => anno.type === 'blank_page' && anno.page === currentPage)
                    ? 'bg-red-600 text-white shadow-sm ring-2 ring-red-400 animate-pulse'
                    : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                }`}
                title="Mark page as blank"
              >
                <FileText size={16} />
                <span className="text-[8px] font-bold leading-tight">Blank</span>
              </button>

              {/* Clear Canvas */}
              <button 
                onClick={clearCanvas} 
                disabled={readOnly} 
                className="w-10 h-9 flex flex-col items-center justify-center rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" 
                title="Clear Page Annotations"
              >
                <RotateCcw size={14} />
                <span className="text-[8px] font-bold">Clear</span>
              </button>

              {/* Delete Selected (when active) */}
              {selectedAnno && (
                <button
                  onClick={() => {
                    const updated = annotations.filter(anno => anno.id !== selectedAnno.id);
                    setAnnotations(updated);
                    saveAnnotationsToStorage(updated);
                    onAnnotationsChange?.(updated);
                    setSelectedAnno(null);
                  }}
                  className="w-10 h-9 flex flex-col items-center justify-center rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors animate-pulse"
                  title="Delete Selected Annotation"
                >
                  <Trash2 size={14} />
                  <span className="text-[8px] font-bold">Del</span>
                </button>
              )}
            </div>
          )}
        </div>

      {/* Text Input Modal */}
      {showTextInput && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 shadow-xl border border-gray-200 w-96 animate-in zoom-in duration-150">
            <h3 className="text-lg font-bold mb-4 text-gray-900">Add Feedback</h3>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Enter text..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && addTextAnnotation()}
            />
            <div className="flex gap-2">
              <button onClick={addTextAnnotation} className="flex-1 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-semibold transition-colors">Add</button>
              <button onClick={() => setShowTextInput(false)} className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Entry Popup */}
      {showMarkPopup && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-lg border border-gray-300 shadow-xl w-80 animate-in zoom-in duration-150">
            <div className="bg-gray-50 p-3 border-b border-gray-200 rounded-t-lg">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-semibold text-gray-600">Section:</p>
                {currentQuestionId && (
                  <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 shadow-sm">
                    Q. {currentQuestionId}
                  </span>
                )}
              </div>
              <select 
                value={stepName}
                onChange={(e) => setStepName(e.target.value)}
                className="w-full text-sm font-semibold p-2 border border-gray-300 rounded-lg outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                {sections.length > 0
                  ? sections.map((sec) => (
                      <option key={sec.id} value={sec.name}>{sec.name}</option>
                    ))
                  : <option value="">No sections</option>
                }
              </select>
            </div>
            
            {/* Skip Question Checkbox */}
            <div className="p-3 border-b border-gray-200 bg-orange-50">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSkipped}
                  onChange={(e) => setIsSkipped(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                />
                <span className="text-sm font-semibold text-orange-900">Mark as Skipped</span>
              </label>
              <p className="text-xs text-orange-700 mt-1 ml-7">Question was not attempted by student</p>
            </div>

            {/* Marks Grid */}
            {!isSkipped && (
              <div className="p-3 max-h-48 overflow-y-auto">
                {canAttemptQuestion && !canAttemptQuestion(pendingAnno?.questionId) && (
                  <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 font-medium">
                    ⚠️ Maximum attempt limit reached for this section. You can mark this question as skipped.
                  </div>
                )}
                <div className="grid grid-cols-4 gap-1">
                  {getMarkOptions().map((m) => {
                    const isBlocked = m > 0 && canAttemptQuestion && !canAttemptQuestion(pendingAnno?.questionId);
                    return (
                      <button
                        key={m}
                        disabled={isBlocked}
                        onClick={() => {
                          if (isBlocked) {
                            message.warning("Section attempt limit reached! You can mark this question as skipped.");
                            return;
                          }
                          setMarkInput(m.toString());
                          const finalAnno = { 
                            ...pendingAnno, 
                            marks: m,
                            stepName: stepName,
                            isSkipped: false,
                            type: m > 0 ? 'tick' : 'cross',
                            color: m > 0 ? '#00AA00' : '#FF0000'
                          };
                          const updated = [...annotations, finalAnno];
                          setAnnotations(updated);
                          saveAnnotationsToStorage(updated);
                          onAnnotationsChange?.(updated);
                          setPendingAnno(null);
                          setShowMarkPopup(false);
                          if (onNextQuestion) onNextQuestion();
                        }}
                        className={`text-center py-2 text-sm font-semibold border rounded transition-colors ${
                          isBlocked
                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50'
                            : 'hover:bg-teal-700 hover:text-white border-gray-200 cursor-pointer'
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            <div className="p-3 flex gap-2 border-t border-gray-200">
              {isSkipped ? (
                <button 
                  onClick={() => {
                    const finalAnno = { 
                      ...pendingAnno, 
                      marks: 0,
                      stepName: stepName,
                      isSkipped: true,
                      type: 'cross',
                      color: '#FF6B6B'
                    };
                    const updated = [...annotations, finalAnno];
                    setAnnotations(updated);
                    saveAnnotationsToStorage(updated);
                    onAnnotationsChange?.(updated);
                    setPendingAnno(null);
                    setShowMarkPopup(false);
                    setIsSkipped(false);
                    if (onNextQuestion) onNextQuestion();
                  }}
                  className="flex-1 text-sm bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg font-semibold transition-colors"
                >
                  Confirm Skip
                </button>
              ) : (
                <>
                  <input
                    type="number"
                    value={markInput}
                    onChange={(e) => setMarkInput(e.target.value)}
                    placeholder="Custom"
                    className="w-20 min-w-0 flex-1 text-sm p-2 border border-gray-300 rounded-lg outline-none focus:border-teal-500"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && submitMark()}
                  />
                  <button onClick={submitMark} className="text-sm bg-teal-700 hover:bg-teal-800 text-white px-3 py-2 rounded-md font-semibold transition-colors">
                    Submit
                  </button>
                </>
              )}
              <button onClick={() => {setShowMarkPopup(false); setPendingAnno(null); setIsSkipped(false);}} className="text-sm bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded-lg font-semibold transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas Container */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col flex-1 min-h-[400px] relative">
        {/* Absolute PDF Navigation Overlays */}
        {pdfPages.length > 0 && (
          <>
            <button
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all disabled:opacity-0 z-10 shadow-lg backdrop-blur-sm"
              title="Previous Page"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(pdfPages.length - 1, currentPage + 1))}
              disabled={currentPage === pdfPages.length - 1}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all disabled:opacity-0 z-10 shadow-lg backdrop-blur-sm"
              title="Next Page"
            >
              <ChevronRight size={24} />
            </button>
            
            {/* Page Indicator */}
            <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-bold z-10 shadow-md">
              Page {currentPage + 1} of {pdfPages.length}
            </div>
          </>
        )}

        <div
          ref={canvasContainerRef}
          data-annotator-container="true"
          onContextMenu={handleContextMenu}
          className="bg-gray-100 overflow-auto flex-1 flex justify-center p-4 relative select-none"
          onMouseUp={handleTextSelection}
          onMouseMove={(e) => {
            if (panStateRef.current.isPanning) {
              const container = canvasContainerRef.current;
              if (container) {
                const dx = e.clientX - panStateRef.current.startX;
                const dy = e.clientY - panStateRef.current.startY;
                container.scrollLeft = panStateRef.current.scrollLeft - dx;
                container.scrollTop = panStateRef.current.scrollTop - dy;
              }
            }
          }}
          onMouseLeave={() => {
            panStateRef.current.isPanning = false;
          }}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onContextMenu={handleContextMenu}
            style={{ width: canvasSize.width * zoom, height: canvasSize.height * zoom }}
            className={`flex-shrink-0 max-w-none bg-white shadow-md rounded-lg ${tool === 'move' ? 'cursor-move' : 'cursor-crosshair'}`}
          />
        </div>

        {/* PDF Navigation (Removed in favor of overlay arrows) */}
      </div>
    </div>
  </div>
  );
});

export default PDFAnnotator;
