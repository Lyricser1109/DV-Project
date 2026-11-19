// Overall cases and recorded deaths, independent of the age chart's axes.
// Data is summed from Count of cases and Died_cases in the supplied national CSV.
const loadSexAgeOverview = () => {
    const chart = d3.select("#sex-overview-chart");
    const tooltip = d3.select("#sex-overview-tooltip");
    const note = d3.select("#sex-overview-note");
    const sexes = ["Male", "Female", "Unknown"];
    const colours = { Male: "#5572c7", Female: "#c45e71", Unknown: "#8a98a8" };
    const formatCount = d3.format(",d");

    d3.csv("data/sex-age-overall.csv", d => ({
        firstYear: +d["First year"],
        lastYear: +d["Last year"],
        sex: d.Sex,
        cases: d.Cases.trim() === "" ? NaN : +d.Cases,
        deaths: d.Deaths.trim() === "" ? NaN : +d.Deaths
    })).then(data => {
        if (data.length !== sexes.length || new Set(data.map(d => d.sex)).size !== sexes.length
            || data.some(d => !sexes.includes(d.sex)
                || !Number.isInteger(d.firstYear) || !Number.isInteger(d.lastYear)
                || !Number.isInteger(d.cases) || d.cases < 0
                || !Number.isInteger(d.deaths) || d.deaths < 0 || d.deaths > d.cases)) {
            throw new Error("The overall summary CSV contains missing or unexpected values.");
        }

        const period = `${d3.min(data, d => d.firstYear)}–${d3.max(data, d => d.lastYear)}`;
        const bySex = new Map(data.map(d => [d.sex, d]));
        const metrics = [
            { key: "cases", label: "Overall cases", detail: "Includes deaths", total: d3.sum(data, d => d.cases) },
            { key: "deaths", label: "Mortality", detail: "Deaths in care", total: d3.sum(data, d => d.deaths) }
        ];

        const legend = d3.select("#sex-overview-legend")
            .selectAll("li")
            .data(sexes)
            .join("li");
        legend.append("span").attr("class", "age-swatch").style("background-color", d => colours[d]);
        legend.append("span").text(d => d === "Unknown" ? "Unknown sex" : d);
        chart.select(".chart-loading").remove();

        const hideTooltip = () => tooltip.property("hidden", true);
        const showTooltip = (event, d) => {
            tooltip
                .text(`${d.metric.label} · ${d.sex}\n${formatCount(d.count)} (${period})\n${d3.format(".1%")(d.count / d.metric.total)} of this summary total`)
                .property("hidden", false);
            const bounds = chart.node().getBoundingClientRect();
            const segment = event.currentTarget.getBoundingClientRect();
            const box = tooltip.node().getBoundingClientRect();
            tooltip
                .style("left", `${Math.max(0, Math.min(segment.left - bounds.left + segment.width / 2 - box.width / 2, bounds.width - box.width))}px`)
                .style("top", `${Math.max(0, segment.top - bounds.top - box.height - 8)}px`);
        };

        const drawOverview = () => {
            hideTooltip();
            const width = chart.node().clientWidth;
            const compact = width < 600;
            const gap = compact ? 76 : 106;
            const edge = 14;
            const sideWidth = Math.max(1, (width - gap - edge * 2) / 2);
            const leftZero = edge + sideWidth;
            const rightZero = leftZero + gap;
            const barY = 78;
            const barHeight = 24;
            const svg = chart.selectAll("svg")
                .data([null])
                .join("svg")
                .attr("viewBox", `0 0 ${width} 160`)
                .attr("role", "group")
                .attr("aria-labelledby", "sex-overview-heading")
                .attr("aria-describedby", "sex-overview-note");
            svg.selectAll("*").remove();

            metrics.forEach((metric, index) => {
                const left = index === 0;
                const zero = left ? leftZero : rightZero;
                const scale = d3.scaleLinear().domain([0, metric.total]).nice(4).range([0, sideWidth]);
                const maximum = scale.domain()[1];
                const position = value => zero + (left ? -scale(value) : scale(value));
                const group = svg.append("g")
                    .attr("class", "overview-metric")
                    .attr("data-metric", metric.key);

                group.append("text")
                    .attr("class", "overview-heading")
                    .attr("x", left ? edge + sideWidth / 2 : rightZero + sideWidth / 2)
                    .attr("y", 18)
                    .attr("text-anchor", "middle")
                    .text(metric.label);
                group.append("text")
                    .attr("class", "overview-detail")
                    .attr("x", left ? edge + sideWidth / 2 : rightZero + sideWidth / 2)
                    .attr("y", 36)
                    .attr("text-anchor", "middle")
                    .text(metric.detail);

                group.append("rect")
                    .attr("class", "overview-track")
                    .attr("x", left ? edge : rightZero)
                    .attr("y", barY)
                    .attr("width", sideWidth)
                    .attr("height", barHeight);

                let cursor = 0;
                const segments = [...sexes].reverse().map(sex => {
                    const count = bySex.get(sex)[metric.key];
                    const start = cursor;
                    cursor += count;
                    return { sex, count, start, end: cursor, metric };
                }).filter(d => d.count > 0);

                group.selectAll(".overview-segment")
                    .data(segments)
                    .join("rect")
                    .attr("class", "overview-segment")
                    .attr("x", d => left ? position(d.end) : position(d.start))
                    .attr("y", barY)
                    .attr("width", d => scale(d.count))
                    .attr("height", barHeight)
                    .attr("fill", d => colours[d.sex])
                    .attr("tabindex", 0)
                    .attr("role", "img")
                    .attr("aria-label", d => `${metric.label}, ${d.sex}, ${formatCount(d.count)}, ${period}`)
                    .on("pointerenter focus click", showTooltip)
                    .on("pointerleave blur", hideTooltip)
                    .on("keydown", event => { if (event.key === "Escape") hideTooltip(); });

                group.append("text")
                    .attr("class", "overview-total")
                    .attr("x", position(metric.total))
                    .attr("y", barY - 10)
                    .attr("text-anchor", left ? "start" : "end")
                    .text(formatCount(metric.total));

                // Short reference marks replace a full axis and grid for this strip.
                const milestones = group.selectAll(".overview-milestone")
                    .data([0, maximum / 2, maximum])
                    .join("g")
                    .attr("class", "overview-milestone")
                    .attr("transform", d => `translate(${position(d)}, ${barY + barHeight})`);
                milestones.append("line").attr("y1", 5).attr("y2", 11);
                milestones.append("text")
                    .attr("y", 27)
                    .attr("text-anchor", "middle")
                    .text(d3.format("~s"));
            });

            svg.append("text")
                .attr("class", "overview-centre-label")
                .attr("x", width / 2)
                .attr("y", barY + barHeight / 2)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .text("All ages");
        };

        drawOverview();
        const resizeObserver = new ResizeObserver(drawOverview);
        resizeObserver.observe(chart.node());
    }).catch(error => {
        console.error("Unable to load the overall cases and mortality summary:", error);
        chart.select(".chart-loading").remove();
        chart.selectAll("svg").remove();
        note.text("The overall cases and mortality summary could not be loaded. Please check its CSV file and reload the page.");
    });
};

loadSexAgeOverview();
