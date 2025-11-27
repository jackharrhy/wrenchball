import { PlayerIcon } from "~/components/PlayerIcon";
import type { Route } from "./+types/players.chemistry-graph";
import { db } from "~/database/db";
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { cn } from "~/utils/cn";

export async function loader({ request }: Route.LoaderArgs) {
  const allPlayers = await db.query.players.findMany({
    with: {
      team: true,
      stats: true,
    },
    orderBy: (players, { asc }) => asc(players.sortPosition),
  });

  // Get all unique stat characters
  const allStats = await db.query.stats.findMany();

  // Get all chemistry relationships
  const allChemistry = await db.query.chemistry.findMany();

  // Create a map for quick chemistry lookup
  const chemistryMap = new Map<string, Map<string, "positive" | "negative">>();
  for (const chem of allChemistry) {
    if (!chemistryMap.has(chem.character1)) {
      chemistryMap.set(chem.character1, new Map());
    }
    if (!chemistryMap.has(chem.character2)) {
      chemistryMap.set(chem.character2, new Map());
    }
    chemistryMap.get(chem.character1)!.set(chem.character2, chem.relationship);
    chemistryMap.get(chem.character2)!.set(chem.character1, chem.relationship);
  }

  // Create a map of stat character to player for displaying icons
  const characterToPlayerMap = new Map<string, (typeof allPlayers)[0]>();
  for (const player of allPlayers) {
    if (player.statsCharacter) {
      characterToPlayerMap.set(player.statsCharacter, player);
    }
  }

  // Create a map of stat character to sortPosition
  const characterToSortPositionMap = new Map<string, number>();
  for (const player of allPlayers) {
    if (player.statsCharacter) {
      characterToSortPositionMap.set(
        player.statsCharacter,
        player.sortPosition,
      );
    }
  }

  return {
    players: allPlayers,
    stats: allStats,
    chemistry: allChemistry,
    chemistryMap,
    characterToPlayerMap,
    characterToSortPositionMap,
  };
}

type GraphNode = d3.SimulationNodeDatum & {
  id: string;
  character: string;
  player?: {
    id: number;
    name: string;
    imageUrl: string | null;
    statsCharacter: string | null;
  };
};

type GraphLink = d3.SimulationLinkDatum<GraphNode> & {
  source: string | GraphNode;
  target: string | GraphNode;
  type: "positive" | "negative";
};

export default function PlayersChemistryGraph({
  loaderData,
}: Route.ComponentProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(
    null,
  );
  const nodeRef = useRef<d3.Selection<
    SVGGElement,
    GraphNode,
    SVGGElement,
    unknown
  > | null>(null);
  const linkRef = useRef<d3.Selection<
    SVGLineElement,
    GraphLink,
    SVGGElement,
    unknown
  > | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Clear previous content
    svg.selectAll("*").remove();

    // Create nodes from characters with chemistry
    const nodeCharacters = new Set<string>();
    for (const chem of loaderData.chemistry) {
      nodeCharacters.add(chem.character1);
      nodeCharacters.add(chem.character2);
    }

    const nodes: GraphNode[] = Array.from(nodeCharacters).map((character) => ({
      id: character,
      character,
      player: loaderData.characterToPlayerMap.get(character),
      x: width / 2 + (Math.random() - 0.5) * Math.min(width, height) * 0.4,
      y: height / 2 + (Math.random() - 0.5) * Math.min(width, height) * 0.4,
    }));

    // Create links from chemistry relationships
    const links: GraphLink[] = loaderData.chemistry.map((chem) => ({
      source: chem.character1,
      target: chem.character2,
      type: chem.relationship,
    }));

    // Create node map for link resolution
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Resolve link sources and targets
    links.forEach((link) => {
      link.source = nodeMap.get(link.source as string)!;
      link.target = nodeMap.get(link.target as string)!;
    });

    // Create force simulation
    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance((d) => {
            // Different distances for positive vs negative chemistry - increased for more spacing
            return d.type === "positive" ? 150 : 200;
          }),
      )
      .force(
        "charge",
        d3.forceManyBody<GraphNode>().strength((d, i) => {
          // Attraction for positive chemistry, repulsion for negative
          const positiveLinks = links
            .filter(
              (l) =>
                (l.source as GraphNode).id === d.id ||
                (l.target as GraphNode).id === d.id,
            )
            .filter((l) => l.type === "positive").length;
          const negativeLinks = links
            .filter(
              (l) =>
                (l.source as GraphNode).id === d.id ||
                (l.target as GraphNode).id === d.id,
            )
            .filter((l) => l.type === "negative").length;
          // Increased base repulsion for more spacing
          return -800 + positiveLinks * 100 - negativeLinks * 150;
        }),
      )
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide().radius((d) => 40),
      )
      .alphaDecay(0.02); // Slower decay for more gradual settling

    simulationRef.current = simulation;

    // Create zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Create container group for zoom/pan
    const g = svg.append("g");

    // Draw links
    const link = g
      .append("g")
      .attr("class", "links")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", (d) => (d.type === "positive" ? "#4ade80" : "#f87171"))
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.6)
      .attr(
        "marker-end",
        (d) =>
          `url(#arrowhead-${d.type === "positive" ? "positive" : "negative"})`,
      );

    linkRef.current = link;

    // Draw arrow markers for links (one for positive, one for negative)
    const defs = svg.append("defs");

    // Positive chemistry arrow (green)
    defs
      .append("marker")
      .attr("id", "arrowhead-positive")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#4ade80");

    // Negative chemistry arrow (red)
    defs
      .append("marker")
      .attr("id", "arrowhead-negative")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#f87171");

    // Draw nodes
    const node = g
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    nodeRef.current = node;

    // Add circles for nodes
    node
      .append("circle")
      .attr("r", 25)
      .attr("fill", (d) => {
        if (selectedNode === d.id) return "#60a5fa";
        if (hoveredNode === d.id) return "#93c5fd";
        return "#374151";
      })
      .attr("stroke", (d) => {
        if (selectedNode === d.id) return "#3b82f6";
        if (hoveredNode === d.id) return "#60a5fa";
        return "#6b7280";
      })
      .attr("stroke-width", 2);

    // Add player icons as images
    node
      .append("image")
      .attr("x", -15)
      .attr("y", -15)
      .attr("width", 30)
      .attr("height", 30)
      .attr("href", (d) => {
        return d.player?.imageUrl || "/images/players/sideview/right/mario.png";
      })
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("pointer-events", "none");

    // Add labels
    node
      .append("text")
      .attr("dy", 35)
      .attr("text-anchor", "middle")
      .attr("fill", "#e5e7eb")
      .attr("font-size", "10px")
      .attr("font-family", "sans-serif")
      .text((d) => d.character);

    // Update positions on simulation tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x!)
        .attr("y1", (d) => (d.source as GraphNode).y!)
        .attr("x2", (d) => (d.target as GraphNode).x!)
        .attr("y2", (d) => (d.target as GraphNode).y!);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    // Add hover interactions
    node
      .on("mouseenter", (event, d) => {
        setHoveredNode(d.id);
      })
      .on("mouseleave", () => {
        setHoveredNode(null);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        setSelectedNode((prev) => (prev === d.id ? null : d.id));
      });

    // Cleanup
    return () => {
      simulation.stop();
      svg.on(".zoom", null);
    };
  }, [loaderData.chemistry, loaderData.characterToPlayerMap]);

  // Update visual styling when hover/select changes (without recreating simulation)
  useEffect(() => {
    if (!nodeRef.current || !linkRef.current) return;

    const node = nodeRef.current;
    const link = linkRef.current;
    const links = loaderData.chemistry.map((chem) => ({
      source: chem.character1,
      target: chem.character2,
      type: chem.relationship,
    }));

    // Update node circle colors and opacity
    node
      .select("circle")
      .attr("fill", (d) => {
        if (selectedNode === d.id) return "#60a5fa";
        if (hoveredNode === d.id) return "#93c5fd";
        return "#374151";
      })
      .attr("stroke", (d) => {
        if (selectedNode === d.id) return "#3b82f6";
        if (hoveredNode === d.id) return "#60a5fa";
        return "#6b7280";
      });

    // Update link and node opacity based on hover
    if (hoveredNode) {
      link.attr("stroke-opacity", (l) => {
        const sourceId =
          typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
        const targetId =
          typeof l.target === "string" ? l.target : (l.target as GraphNode).id;
        return sourceId === hoveredNode || targetId === hoveredNode ? 1 : 0.2;
      });
      node.select("circle").attr("opacity", (n) => {
        const isConnected = links.some(
          (l) =>
            (l.source === hoveredNode && l.target === n.id) ||
            (l.target === hoveredNode && l.source === n.id),
        );
        return isConnected || n.id === hoveredNode ? 1 : 0.3;
      });
    } else {
      link.attr("stroke-opacity", 0.6);
      node.select("circle").attr("opacity", 1);
    }
  }, [hoveredNode, selectedNode, loaderData.chemistry]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-hidden max-h-[calc(100vh-15rem)]"
    >
      <svg ref={svgRef} className="w-full h-full" style={{ cursor: "grab" }}>
        <g className="container"></g>
      </svg>
    </div>
  );
}
