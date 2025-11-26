import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

import type { D3DragEvent, SimulationLinkDatum, SimulationNodeDatum } from 'd3'
import type { GraphEdge, GraphNode } from '../lib/api'

interface GraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  highlightedNodeId?: string | null
  onNodeClick?: (nodeId: string | null) => void
}

type SimNode = GraphNode & SimulationNodeDatum
type SimLink = SimulationLinkDatum<SimNode> & GraphEdge

export const Graph = ({ nodes, edges, highlightedNodeId, onNodeClick }: GraphProps) => {
  const ref = useRef<SVGSVGElement | null>(null)
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const nodesRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const isInitializedRef = useRef(false)

  // Main effect: Create simulation and render graph
  useEffect(() => {
    if (!ref.current) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const width = ref.current.clientWidth || 600
    const height = ref.current.clientHeight || 500
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    // Create a set of valid node IDs
    const validNodeIds = new Set(nodes.map((n) => n.id))

    // Filter edges to only include those with valid source and target nodes
    const validEdges = edges.filter(
      (edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target),
    )

    // Initialize nodes with circular layout
    const simNodes: SimNode[] = nodes.map((node, index) => {
      const angle = nodes.length > 1 ? (index * 2 * Math.PI) / nodes.length : 0
      const radius = Math.min(width, height) * 0.35
      const initialX = width / 2 + radius * Math.cos(angle)
      const initialY = height / 2 + radius * Math.sin(angle)
      
      return {
        ...node,
        x: initialX,
        y: initialY,
        vx: 0,
        vy: 0,
        fx: undefined,
        fy: undefined,
      }
    })
    const simLinks: SimLink[] = validEdges.map((edge) => ({ ...edge }))

    // Create container group for zoom/pan
    const container = svg.append('g').attr('class', 'graph-container')

    // Setup zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        container.attr('transform', event.transform.toString())
      })

    zoomRef.current = zoom
    svg.call(zoom)

    // Create simulation
    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => 30 + (1 - (d.weight || 0.5)) * 20),
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d) => (d.weight || 1) * 4 + 20))
      .alphaDecay(0.01)
      .alpha(1)
      .velocityDecay(0.6)

    simulationRef.current = simulation

    // Draw links
    const linkGroup = container.append('g').attr('class', 'links')
    const link = linkGroup
      .selectAll('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('stroke', '#475569')
      .attr('stroke-width', (d: SimLink) => Math.max(1, (d.weight || 0.5) * 2))
      .attr('stroke-opacity', 0.4)
      // Store source and target IDs as data attributes for highlight updates
      .attr('data-source', (d: SimLink) => {
        return typeof d.source === 'object' ? d.source.id : d.source
      })
      .attr('data-target', (d: SimLink) => {
        return typeof d.target === 'object' ? d.target.id : d.target
      })

    // Draw nodes - set initial positions immediately
    const nodeGroup = container.append('g').attr('class', 'nodes')
    const node = nodeGroup
      .selectAll('circle')
      .data(simNodes)
      .enter()
      .append('circle')
      .attr('r', (d: SimNode) => 5 + Math.min(8, (d.weight || 0) * 2))
      .attr('fill', (d: SimNode) => (d.type === 'topic' ? '#34d399' : '#60a5fa'))
      .attr('stroke', 'rgba(148, 163, 184, 0.3)')
      .attr('stroke-width', 1)
      .attr('cx', (d: SimNode) => d.x ?? width / 2) // Set initial position
      .attr('cy', (d: SimNode) => d.y ?? height / 2) // Set initial position
      .attr('data-node-id', (d: SimNode) => d.id) // Store node ID as data attribute
      .attr('data-node-type', (d: SimNode) => d.type) // Store node type as data attribute
      .style('cursor', 'pointer')
      .call(
        d3
          .drag<SVGCircleElement, SimNode>()
          .on('start', (event: D3DragEvent<SVGCircleElement, SimNode, SimNode>, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event: D3DragEvent<SVGCircleElement, SimNode, SimNode>, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event: D3DragEvent<SVGCircleElement, SimNode, SimNode>, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          }),
      )
      .on('click', (event: MouseEvent, d: SimNode) => {
        event.stopPropagation()
        if (onNodeClick) {
          onNodeClick(highlightedNodeId === d.id ? null : d.id)
        }
      })

    // Draw labels - set initial positions immediately
    const labelGroup = container.append('g').attr('class', 'labels')
    const labels = labelGroup
      .selectAll('text')
      .data(simNodes)
      .enter()
      .append('text')
      .text((d: SimNode) => d.label)
      .attr('font-size', 14)
      .attr('fill', '#e5e7eb')
      .attr('font-weight', 'normal')
      .attr('x', (d: SimNode) => (d.x ?? width / 2) + 12) // Set initial position
      .attr('y', (d: SimNode) => (d.y ?? height / 2) + 5) // Set initial position
      .attr('data-node-id', (d: SimNode) => d.id) // Store node ID as data attribute
      .style('pointer-events', 'none')
      .style('user-select', 'none')

    // Tooltips
    node.append('title').text((d: SimNode) => `${d.label} (${d.type})\nWeight: ${d.weight.toFixed(2)}`)

    // Simulation tick handler
    let hasInitialized = false
    let tickCount = 0
    const maxTicks = 300

    simulation.on('tick', () => {
      tickCount++

      // Update link positions
      link
        .attr('x1', (d) => {
          const source = d.source as SimNode
          return source.x ?? width / 2
        })
        .attr('y1', (d) => {
          const source = d.source as SimNode
          return source.y ?? height / 2
        })
        .attr('x2', (d) => {
          const target = d.target as SimNode
          return target.x ?? width / 2
        })
        .attr('y2', (d) => {
          const target = d.target as SimNode
          return target.y ?? height / 2
        })

      // Update node positions - always update if defined
      node.attr('cx', (d: SimNode) => {
        return d.x !== undefined && d.x !== null ? d.x : width / 2
      }).attr('cy', (d: SimNode) => {
        return d.y !== undefined && d.y !== null ? d.y : height / 2
      })

      // Update label positions
      labels.attr('x', (d: SimNode) => {
        return (d.x !== undefined && d.x !== null ? d.x : width / 2) + 12
      }).attr('y', (d: SimNode) => {
        return (d.y !== undefined && d.y !== null ? d.y : height / 2) + 5
      })

      // Save positions
      simNodes.forEach((n) => {
        if (n.x !== undefined && n.y !== undefined) {
          nodesRef.current.set(n.id, { x: n.x, y: n.y })
        }
      })

      // Lock positions after simulation settles
      if (!hasInitialized && simulation.alpha() < 0.01 && tickCount >= maxTicks) {
        hasInitialized = true
        isInitializedRef.current = true

        simNodes.forEach((n) => {
          if (n.x !== undefined && n.y !== undefined && n.fx === undefined && n.fy === undefined) {
            n.fx = n.x
            n.fy = n.y
          }
        })

        simNodes.forEach((n) => {
          if (n.x !== undefined && n.y !== undefined) {
            nodesRef.current.set(n.id, { x: n.x, y: n.y })
          }
        })

        simulation.stop()
      }
    })

    // Click outside to deselect
    svg.on('click', (event) => {
      if ((event.target as Element).tagName === 'svg') {
        if (onNodeClick) {
          onNodeClick(null)
        }
      }
    })

    return () => {
      simulation.stop()
      isInitializedRef.current = false
    }
  }, [nodes, edges, onNodeClick])

  // Separate effect for highlight - use data attributes to avoid data rebinding
  useEffect(() => {
    if (!ref.current) return

    // CRITICAL: Do NOT access simulation or stop it - this can cause position resets
    // Only update visual styles using data attributes

    const svg = d3.select(ref.current)

    // Update link opacity using data attributes
    svg.selectAll<SVGLineElement, unknown>('.links line').each(function () {
      const line = this as SVGLineElement
      const sourceId = line.getAttribute('data-source')
      const targetId = line.getAttribute('data-target')
      
      let opacity = 0.4
      if (highlightedNodeId && (sourceId === highlightedNodeId || targetId === highlightedNodeId)) {
        opacity = 0.8
      } else if (highlightedNodeId) {
        opacity = 0.15
      }
      line.setAttribute('stroke-opacity', opacity.toString())
    })

    // Update node styles using data attributes - NO datum() access
    svg.selectAll<SVGCircleElement, unknown>('.nodes circle').each(function () {
      const circle = this as SVGCircleElement
      const nodeId = circle.getAttribute('data-node-id')
      const nodeType = circle.getAttribute('data-node-type')
      
      if (!nodeId) return

      const isHighlighted = highlightedNodeId === nodeId
      
      // Update fill color
      if (nodeType === 'topic') {
        circle.setAttribute('fill', isHighlighted ? '#10b981' : '#34d399')
      } else {
        circle.setAttribute('fill', isHighlighted ? '#3b82f6' : '#60a5fa')
      }
      
      // Update stroke
      circle.setAttribute('stroke', isHighlighted ? '#fbbf24' : 'rgba(148, 163, 184, 0.3)')
      circle.setAttribute('stroke-width', isHighlighted ? '3' : '1')
    })

    // Update label font weight using data attributes
    svg.selectAll<SVGTextElement, unknown>('.labels text').each(function () {
      const text = this as SVGTextElement
      const nodeId = text.getAttribute('data-node-id')
      
      if (!nodeId) return
      
      text.setAttribute('font-weight', highlightedNodeId === nodeId ? 'bold' : 'normal')
    })
  }, [highlightedNodeId])

  const handleZoomIn = () => {
    if (ref.current && zoomRef.current) {
      const svg = d3.select(ref.current)
      svg.transition().duration(300).call(zoomRef.current.scaleBy, 1.2)
    }
  }

  const handleZoomOut = () => {
    if (ref.current && zoomRef.current) {
      const svg = d3.select(ref.current)
      svg.transition().duration(300).call(zoomRef.current.scaleBy, 0.8)
    }
  }

  const handleReset = () => {
    if (ref.current && zoomRef.current) {
      const svg = d3.select(ref.current)
      const width = (ref.current.clientWidth || 600) / 2
      const height = (ref.current.clientHeight || 500) / 2
      svg.transition().duration(500).call(zoomRef.current.translateTo, width, height)
      svg.transition().duration(500).call(zoomRef.current.scaleTo, 1)
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={ref} className="graph-canvas" role="img" aria-label="Relationship graph" />
      <div className="graph-controls">
        <button
          type="button"
          className="graph-control-button"
          onClick={handleZoomIn}
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="graph-control-button"
          onClick={handleZoomOut}
          title="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="graph-control-button"
          onClick={handleReset}
          title="Reset view"
        >
          ⌂
        </button>
      </div>
    </div>
  )
}
