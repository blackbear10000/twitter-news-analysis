import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

import type { D3DragEvent, SimulationLinkDatum, SimulationNodeDatum } from 'd3'
import type { GraphEdge, GraphNode } from '../lib/api'

interface GraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  topicScoreMap?: Map<string, number>
  personTopicConnectionCount?: Map<string, number>
  highlightedNodeId?: string | null
  onNodeClick?: (nodeId: string | null) => void
}

type SimNode = GraphNode & SimulationNodeDatum
type SimLink = SimulationLinkDatum<SimNode> & GraphEdge

export const Graph = ({
  nodes,
  edges,
  topicScoreMap = new Map(),
  personTopicConnectionCount = new Map(),
  highlightedNodeId,
  onNodeClick,
}: GraphProps) => {
  const ref = useRef<SVGSVGElement | null>(null)
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const nodesRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const isInitializedRef = useRef(false)
  const rotationRef = useRef<number>(0)
  const animationFrameRef = useRef<number | null>(null)
  const centerRef = useRef<{ x: number; y: number } | null>(null)

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

    // Separate nodes by type
    const topicNodes = nodes.filter((n) => n.type === 'topic')
    const personNodes = nodes.filter((n) => n.type === 'user')
    const otherNodes = nodes.filter((n) => n.type !== 'topic' && n.type !== 'user')

    // Initialize nodes with layout: Topics in center, Persons in outer ring
    const simNodes: SimNode[] = nodes.map((node) => {
      let initialX: number
      let initialY: number

      if (node.type === 'topic') {
        // Topic nodes: placed in center area with smaller radius
        const topicIndex = topicNodes.findIndex((n) => n.id === node.id)
        const angle = topicNodes.length > 1 ? (topicIndex * 2 * Math.PI) / topicNodes.length : 0
        const radius = Math.min(width, height) * 0.15 // Smaller radius for center
        initialX = width / 2 + radius * Math.cos(angle)
        initialY = height / 2 + radius * Math.sin(angle)
      } else if (node.type === 'user') {
        // Person nodes: placed in outer ring with larger radius
        const personIndex = personNodes.findIndex((n) => n.id === node.id)
        const angle = personNodes.length > 1 ? (personIndex * 2 * Math.PI) / personNodes.length : 0
        const radius = Math.min(width, height) * 0.35 // Larger radius for outer ring
        initialX = width / 2 + radius * Math.cos(angle)
        initialY = height / 2 + radius * Math.sin(angle)
      } else {
        // Other nodes: place in middle ring
        const otherIndex = otherNodes.findIndex((n) => n.id === node.id)
        const angle = otherNodes.length > 1 ? (otherIndex * 2 * Math.PI) / otherNodes.length : 0
        const radius = Math.min(width, height) * 0.25 // Middle radius
        initialX = width / 2 + radius * Math.cos(angle)
        initialY = height / 2 + radius * Math.sin(angle)
      }

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

    // Define center coordinates early for use throughout the component
    const centerX = width / 2
    const centerY = height / 2
    // Store in ref for use in async functions
    centerRef.current = { x: centerX, y: centerY }

    // Create container group for zoom/pan
    const container = svg.append('g').attr('class', 'graph-container')
    
    // Create inner container for rotation (separate from zoom/pan)
    const rotationContainer = container.append('g').attr('class', 'graph-rotation-container')
    // Set transform origin to center
    rotationContainer.attr('transform', `translate(${centerX}, ${centerY})`)

    // Setup zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        container.attr('transform', event.transform.toString())
      })

    zoomRef.current = zoom
    svg.call(zoom)

    // Immediately lock all nodes to prevent collapse animation
    simNodes.forEach((n) => {
      if (n.x !== undefined && n.y !== undefined) {
        n.fx = n.x
        n.fy = n.y
      }
    })

    // Create simulation with reduced forces to prevent excessive diffusion
    // But we'll stop it immediately to prevent any animation
    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => 30 + (1 - (d.weight || 0.5)) * 20),
      )
      .force('charge', d3.forceManyBody().strength(-120)) // Reduced from -200
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.1)) // Reduced center force
      .force('collision', d3.forceCollide().radius((d) => (d.weight || 1) * 3 + 15)) // Reduced collision radius
      .alphaDecay(0.05) // Increased decay rate to stop faster
      .alpha(0) // Set to 0 to prevent any movement
      .velocityDecay(0.7) // Increased velocity decay

    simulationRef.current = simulation
    // Stop simulation immediately to prevent any animation
    simulation.stop()

    // Draw links - make them more visible (inside rotation container)
    const linkGroup = rotationContainer.append('g').attr('class', 'links')
    const link = linkGroup
      .selectAll('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('stroke', '#64748b') // Lighter color for better visibility
      .attr('stroke-width', (d: SimLink) => Math.max(2, (d.weight || 0.5) * 3)) // Increased from 1-2 to 2-3
      .attr('stroke-opacity', 0.7) // Increased from 0.4 to 0.7 for better visibility
      // Store source and target IDs as data attributes for highlight updates
      .attr('data-source', (d: SimLink) => {
        return typeof d.source === 'object' ? d.source.id : d.source
      })
      .attr('data-target', (d: SimLink) => {
        return typeof d.target === 'object' ? d.target.id : d.target
      })

    // Calculate min and max scores for topics to normalize size range
    const topicScores = simNodes
      .filter((n) => n.type === 'topic')
      .map((n) => topicScoreMap.get(n.id) || n.weight || 0)
    const minTopicScore = topicScores.length > 0 ? Math.min(...topicScores) : 0
    const maxTopicScore = topicScores.length > 0 ? Math.max(...topicScores) : 1
    const topicScoreRange = maxTopicScore - minTopicScore || 1 // Avoid division by zero

    // Calculate node radius based on type and properties
    const calculateNodeRadius = (node: SimNode): number => {
      if (node.type === 'topic') {
        // Topic nodes: size 16-28 based on normalized score within actual range
        const score = topicScoreMap.get(node.id) || node.weight || 0
        // Normalize score to 0-1 range based on actual min/max
        const normalizedScore = topicScoreRange > 0 
          ? (score - minTopicScore) / topicScoreRange 
          : 0
        // Map to size range 16-28 (reduced from 24-56)
        return 16 + normalizedScore * 12 // Range: 16-28
      } else if (node.type === 'user') {
        // Person nodes: base size 8-15 based on topic connections, but max is below topic minimum (16)
        const connectionCount = personTopicConnectionCount.get(node.id) || 0
        const maxConnections = Math.max(1, ...Array.from(personTopicConnectionCount.values()))
        const normalizedConnections = maxConnections > 0 ? connectionCount / maxConnections : 0
        const personSize = 8 + normalizedConnections * 7 // Range: 8-15 (reduced to be below topic minimum of 16)
        return Math.min(personSize, 15) // Cap at 15 (below topic minimum of 16)
      }
      // Fallback for other types
      return 8 + Math.min(8, (node.weight || 0) * 2) // Reduced
    }

    // Draw nodes - set initial positions immediately (inside rotation container)
    const nodeGroup = rotationContainer.append('g').attr('class', 'nodes')
    const node = nodeGroup
      .selectAll('circle')
      .data(simNodes)
      .enter()
      .append('circle')
      .attr('r', calculateNodeRadius)
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

    // Draw labels - set initial positions immediately (inside rotation container)
    // Position labels based on node radius to avoid overlap
    const labelGroup = rotationContainer.append('g').attr('class', 'labels')
    const labels = labelGroup
      .selectAll('text')
      .data(simNodes)
      .enter()
      .append('text')
      .text((d: SimNode) => d.label)
      .attr('font-size', 14)
      .attr('fill', '#e5e7eb')
      .attr('font-weight', 'normal')
      .attr('x', 0) // Set to 0, position will be controlled by transform
      .attr('y', 0) // Set to 0, position will be controlled by transform
      .attr('text-anchor', 'start') // Align text to start
      .attr('transform', (d: SimNode) => {
        const radius = calculateNodeRadius(d)
        const nodeX = (d.x ?? centerX) - centerX
        const nodeY = (d.y ?? centerY) - centerY
        return `translate(${nodeX + radius + 8}, ${nodeY + 5})`
      })
      .attr('data-node-id', (d: SimNode) => d.id) // Store node ID as data attribute
      .style('pointer-events', 'none')
      .style('user-select', 'none')

    // Tooltips
    node.append('title').text((d: SimNode) => `${d.label} (${d.type})\nWeight: ${d.weight.toFixed(2)}`)

    // Since simulation is stopped immediately, we just render once with initial positions
    // Adjust positions relative to center (since rotation container is translated to center)

    // Update link positions (relative to center)
    link
      .attr('x1', (d) => {
        const source = d.source as SimNode
        return (source.x ?? centerX) - centerX
      })
      .attr('y1', (d) => {
        const source = d.source as SimNode
        return (source.y ?? centerY) - centerY
      })
      .attr('x2', (d) => {
        const target = d.target as SimNode
        return (target.x ?? centerX) - centerX
      })
      .attr('y2', (d) => {
        const target = d.target as SimNode
        return (target.y ?? centerY) - centerY
      })

    // Update node positions - use initial positions (relative to center)
    node.attr('cx', (d: SimNode) => {
      return (d.x !== undefined && d.x !== null ? d.x : centerX) - centerX
    }).attr('cy', (d: SimNode) => {
      return (d.y !== undefined && d.y !== null ? d.y : centerY) - centerY
    })

    // Update label positions - use dynamic radius to avoid overlap (relative to center)
    // Position is controlled by transform, rotation will be applied in animate function
    labels.attr('transform', (d: SimNode) => {
      const radius = calculateNodeRadius(d)
      const nodeX = (d.x !== undefined && d.x !== null ? d.x : centerX) - centerX
      const nodeY = (d.y !== undefined && d.y !== null ? d.y : centerY) - centerY
      return `translate(${nodeX + radius + 8}, ${nodeY + 5})`
    })

    // Save positions
    simNodes.forEach((n) => {
      if (n.x !== undefined && n.y !== undefined) {
        nodesRef.current.set(n.id, { x: n.x, y: n.y })
      }
    })

    isInitializedRef.current = true

    // Start slow rotation animation (360 degrees in 120 seconds = 0.3 degrees per second)
    const rotationSpeed = 0.3 // degrees per second
    let lastTime = performance.now()

    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000 // Convert to seconds
      lastTime = currentTime

      rotationRef.current = (rotationRef.current + rotationSpeed * deltaTime) % 360
      const center = centerRef.current
      if (center) {
        rotationContainer.attr('transform', `translate(${center.x}, ${center.y}) rotate(${rotationRef.current})`)
        // Apply reverse rotation to labels to keep them horizontal
        labels.attr('transform', (d: SimNode) => {
          const nodeX = (d.x ?? center.x) - center.x
          const nodeY = (d.y ?? center.y) - center.y
          const radius = calculateNodeRadius(d)
          return `translate(${nodeX + radius + 8}, ${nodeY + 5}) rotate(${-rotationRef.current})`
        })
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

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
      // Stop rotation animation
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [nodes, edges, topicScoreMap, personTopicConnectionCount, onNodeClick])

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
      
      let opacity = 0.7 // Base opacity matches the new default
      if (highlightedNodeId && (sourceId === highlightedNodeId || targetId === highlightedNodeId)) {
        opacity = 1.0 // Fully visible for highlighted connections
      } else if (highlightedNodeId) {
        opacity = 0.25 // More dimmed for non-highlighted connections
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
