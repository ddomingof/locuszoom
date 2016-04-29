/* global d3,LocusZoom */
/* eslint-env browser */
/* eslint-disable no-console */

"use strict";

/**

  Singletons

  LocusZoom has various singleton objects that are used for registering functions or classes.
  These objects provide safe, standard methods to redefine or delete existing functions/classes
  as well as define new custom functions/classes to be used in a plot.

*/


/****************
  Label Functions

  These functions will generate a string based on a provided state object. Useful for dynamic axis labels.
*/

LocusZoom.LabelFunctions = (function() {
    var obj = {};
    var functions = {};

    obj.get = function(name, state) {
        if (!name) {
            return null;
        } else if (functions[name]) {
            if (typeof state == "undefined"){
                return functions[name];
            } else {
                return functions[name](state);
            }
        } else {
            throw("label function [" + name + "] not found");
        }
    };

    obj.set = function(name, fn) {
        if (fn) {
            functions[name] = fn;
        } else {
            delete functions[name];
        }
    };

    obj.add = function(name, fn) {
        if (functions[name]) {
            throw("label function already exists with name: " + name);
        } else {
            obj.set(name, fn);
        }
    };

    obj.list = function() {
        return Object.keys(functions);
    };

    return obj;
})();

// Label function for "Chromosome # (Mb)" where # comes from state
LocusZoom.LabelFunctions.add("chromosome", function(state){
    if (!isNaN(+state.chr)){ 
        return "Chromosome " + state.chr + " (Mb)";
    } else {
        return "Chromosome (Mb)";
    }
});


/**************************
  Transformation Functions

  Singleton for formatting or transforming a single input, for instance turning raw p values into negeative log10 form
  Transformation functions are chainable with a pipe on a field name, like so: "pvalue|neglog10"

  NOTE: Because these functions are chainable the FUNCTION is returned by get(), not the result of that function.

  All transformation functions must accept an object of parameters and a value to process.
*/
LocusZoom.TransformationFunctions = (function() {
    var obj = {};
    var transformations = {};

    var getTrans = function(name) {
        if (!name) {
            return null;
        }
        var fun = transformations[name];
        if (fun)  {
            return fun;
        } else {
            throw("transformation " + name + " not found");
        }
    };

    //a single transformation with any parameters
    //(parameters not currently supported)
    var parseTrans = function(name) {
        return getTrans(name);
    };

    //a "raw" transformation string with a leading pipe
    //and one or more transformations
    var parseTransString = function(x) {
        var funs = [];
        var re = /\|([^\|]+)/g;
        var result;
        while((result = re.exec(x))!=null) {
            funs.push(result[1]);
        }
        if (funs.length==1) {
            return parseTrans(funs[0]);
        } else if (funs.length > 1) {
            return function(x) {
                var val = x;
                for(var i = 0; i<funs.length; i++) {
                    val = parseTrans(funs[i])(val);
                }
                return val;
            };
        }
        return null;
    };

    //accept both "|name" and "name"
    obj.get = function(name) {
        if (name && name.substring(0,1)=="|") {
            return parseTransString(name);
        } else {
            return parseTrans(name);
        }
    };

    obj.set = function(name, fn) {
        if (name.substring(0,1)=="|") {
            throw("transformation name should not start with a pipe");
        } else {
            if (fn) {
                transformations[name] = fn;
            } else {
                delete transformations[name];
            }
        }
    };

    obj.add = function(name, fn) {
        if (transformations[name]) {
            throw("transformation already exists with name: " + name);
        } else {
            obj.set(name, fn);
        }
    };

    obj.list = function() {
        return Object.keys(transformations);
    };

    return obj;
})();

LocusZoom.TransformationFunctions.add("neglog10", function(x) {
    return -Math.log(x) / Math.LN10;
});

LocusZoom.TransformationFunctions.add("scinotation", function(x) {
    var log;
    if (Math.abs(x) > 1){
        log = Math.ceil(Math.log(x) / Math.LN10);
    } else {
        log = Math.floor(Math.log(x) / Math.LN10);
    }
    if (Math.abs(log) <= 3){
        return x.toFixed(3);
    } else {
        return x.toExponential(2).replace("+", "").replace("e", " × 10^");
    }
});



/****************
  Scale Functions

  Singleton for accessing/storing functions that will convert arbitrary data points to values in a given scale
  Useful for anything that needs to scale discretely with data (e.g. color, point size, etc.)

  All scale functions must accept an object of parameters and a value to process.
*/

LocusZoom.ScaleFunctions = (function() {
    var obj = {};
    var functions = {};

    obj.get = function(name, parameters, value) {
        if (!name) {
            return null;
        } else if (functions[name]) {
            if (typeof parameters == "undefined" && typeof value == "undefined"){
                return functions[name];
            } else {
                return functions[name](parameters, value);
            }
        } else {
            throw("scale function [" + name + "] not found");
        }
    };

    obj.set = function(name, fn) {
        if (fn) {
            functions[name] = fn;
        } else {
            delete functions[name];
        }
    };

    obj.add = function(name, fn) {
        if (functions[name]) {
            throw("scale function already exists with name: " + name);
        } else {
            obj.set(name, fn);
        }
    };

    obj.list = function() {
        return Object.keys(functions);
    };

    return obj;
})();

// Numerical Bin scale function: bin a dataset numerically by an array of breakpoints
LocusZoom.ScaleFunctions.add("numerical_bin", function(parameters, value){
    var breaks = parameters.breaks;
    var values = parameters.values;
    if (value == null || isNaN(+value)){
        return (parameters.null_value ? parameters.null_value : values[0]);
    }
    var threshold = breaks.reduce(function(prev, curr){
        if (+value < prev || (+value >= prev && +value < curr)){
            return prev;
        } else {
            return curr;
        }
    });
    return values[breaks.indexOf(threshold)];
});

// Categorical Bin scale function: bin a dataset numerically by matching against an array of distinct values
LocusZoom.ScaleFunctions.add("categorical_bin", function(parameters, value){
    if (parameters.categories.indexOf(value) != -1){
        return parameters.values[parameters.categories.indexOf(value)];
    } else {
        return (parameters.null_value ? parameters.null_value : parameters.values[0]); 
    }
});


/************************
  Data Layer Subclasses

  The abstract Data Layer class has general methods and properties that apply universally to all Data Layers
  Specific data layer subclasses (e.g. a scatter plot, a line plot, gene visualization, etc.) must be defined
  and registered with this singleton to be accessible.

  All new Data Layer subclasses must be defined by accepting an id string and a layout object.
  Singleton for storing available Data Layer classes as well as updating existing and/or registering new ones
*/

LocusZoom.DataLayers = (function() {
    var obj = {};
    var datalayers = {};

    obj.get = function(name, id, layout, parent) {
        if (!name) {
            return null;
        } else if (datalayers[name]) {
            if (typeof id == "undefined" || typeof layout == "undefined"){
                throw("id or layout argument missing for data layer [" + name + "]");
            } else {
                return new datalayers[name](id, layout, parent);
            }
        } else {
            throw("data layer [" + name + "] not found");
        }
    };

    obj.set = function(name, datalayer) {
        if (datalayer) {
            if (typeof datalayer != "function"){
                throw("unable to set data layer [" + name + "], argument provided is not a function");
            } else {
                datalayers[name] = datalayer;
                datalayers[name].prototype = new LocusZoom.DataLayer();
            }
        } else {
            delete datalayers[name];
        }
    };

    obj.add = function(name, datalayer) {
        if (datalayers[name]) {
            throw("data layer already exists with name: " + name);
        } else {
            obj.set(name, datalayer);
        }
    };

    obj.list = function() {
        return Object.keys(datalayers);
    };

    return obj;
})();



/*********************
  Scatter Data Layer
  Implements a standard scatter plot
*/

LocusZoom.DataLayers.add("scatter", function(id, layout, parent){

    // Define a default layout for this DataLayer type and merge it with the passed argument
    this.DefaultLayout = {
        point_size: 40,
        point_shape: "circle",
        color: "#888888",
        y_axis: {
            axis: 1
        },
        selectable: true
    };
    layout = LocusZoom.mergeLayouts(layout, this.DefaultLayout);

    // Apply the arguments to set LocusZoom.DataLayer as the prototype
    LocusZoom.DataLayer.apply(this, arguments);

    // Reimplement the positionTooltip() method to be scatter-specific
    this.positionTooltip = function(id){
        if (typeof id != "string"){
            throw ("Unable to position tooltip: id is not a string");
        }
        if (!this.tooltips[id]){
            throw ("Unable to position tooltip: id does not point to a valid tooltip");
        }
        var tooltip = this.tooltips[id];
        var arrow_width = 7; // as defined in the default stylesheet
        var stroke_width = 1; // as defined in the default stylesheet
        var border_radius = 6; // as defined in the default stylesheet
        var page_origin = this.getPageOrigin();
        var x_center = this.parent.x_scale(tooltip.data[this.layout.x_axis.field]);
        var y_scale  = "y"+this.layout.y_axis.axis+"_scale";
        var y_center = this.parent[y_scale](tooltip.data[this.layout.y_axis.field]);
        var tooltip_box = tooltip.selector.node().getBoundingClientRect();
        // Position horizontally on the left or the right depending on which side of the plot the point is on
        var offset = Math.sqrt(this.layout.point_size / Math.PI);
        var left, arrow_type, arrow_left;
        if (x_center <= this.parent.layout.width / 2){
            left = page_origin.x + x_center + offset + arrow_width + stroke_width;
            arrow_type = "left";
            arrow_left = -1 * (arrow_width + stroke_width);
        } else {
            left = page_origin.x + x_center - tooltip_box.width - offset - arrow_width - stroke_width;
            arrow_type = "right";
            arrow_left = tooltip_box.width - stroke_width;
        }
        // Position vertically centered unless we're at the top or bottom of the plot
        var data_layer_height = this.parent.layout.height - (this.parent.layout.margin.top + this.parent.layout.margin.bottom);
        var top, arrow_top;
        if (y_center - (tooltip_box.height / 2) <= 0){ // Too close to the top, push it down
            top = page_origin.y + y_center - (1.5 * arrow_width) - border_radius;
            arrow_top = border_radius;
        } else if (y_center + (tooltip_box.height / 2) >= data_layer_height){ // Too close to the bottom, pull it up
            top = page_origin.y + y_center + arrow_width + border_radius - tooltip_box.height;
            arrow_top = tooltip_box.height - (2 * arrow_width) - border_radius;
        } else { // vertically centered
            top = page_origin.y + y_center - (tooltip_box.height / 2);
            arrow_top = (tooltip_box.height / 2) - arrow_width;
        }        
        // Apply positions to the main div
        tooltip.selector.style("left", left + "px").style("top", top + "px");
        // Create / update position on arrow connecting tooltip to data
        if (!tooltip.arrow){
            tooltip.arrow = tooltip.selector.append("div").style("position", "absolute");
        }
        tooltip.arrow
            .attr("class", "lz-data_layer-tooltip-arrow_" + arrow_type)
            .style("left", arrow_left + "px")
            .style("top", arrow_top + "px");
    };

    // Implement the main render function
    this.render = function(){

        var data_layer = this;
        var x_scale = "x_scale";
        var y_scale = "y"+this.layout.y_axis.axis+"_scale";

        // Generate labels first (if defined)
        if (this.layout.label){
            var filtered_data = this.data.filter(function(d){
                if (!data_layer.layout.label.filters){
                    return true;
                } else {
                    // Start by assuming a match, run through all filters to test if not a match
                    var match = true;
                    data_layer.layout.label.filters.forEach(function(filter){
                        switch (filter.operator){
                        case "<":
                            if (!(d[filter.field] < filter.value)){ match = false; }
                            break;
                        case "<=":
                            if (!(d[filter.field] <= filter.value)){ match = false; }
                            break;
                        case ">":
                            if (!(d[filter.field] > filter.value)){ match = false; }
                            break;
                        case ">=":
                            if (!(d[filter.field] >= filter.value)){ match = false; }
                            break;
                        case "=":
                            if (!(d[filter.field] == filter.value)){ match = false; }
                            break;
                        default:
                            // If we got here the operator is not valid, so the filter should fail
                            match = false;
                            break;
                        }
                    });
                    return match;
                }
            });
            this.label_groups = this.svg.group
                .selectAll("g.lz-data_layer-scatter-label")
                .data(filtered_data, function(d){ return d.id + "_label"; });
            this.label_groups.enter()
                .append("g")
                .attr("class", "lz-data_layer-scatter-label");

            // Render label text
            this.label_texts = this.label_groups.append("text")
                .attr("class", "lz-data_layer-scatter-label");
            this.label_texts
                .text(function(d){
                    return LocusZoom.parseFields(d, data_layer.layout.label.text || "");
                })
                .style(data_layer.layout.label.style || {})
                .attr({
                    "x": function(d){
                        var x = data_layer.parent[x_scale](d[data_layer.layout.x_axis.field])
                            + (1.5 * Math.sqrt(data_layer.layout.point_size)) + 2;
                        if (isNaN(x)){ x = -1000; }
                        return x;
                    },
                    "y": function(d){
                        var y = data_layer.parent[y_scale](d[data_layer.layout.y_axis.field])
                              + Math.sqrt(data_layer.layout.point_size);
                        if (isNaN(y)){ y = -1000; }
                        return y;
                    },
                    "text-anchor": function(d){
                        return "start";
                    }
                });            
            // Render label lines
            this.label_lines = this.label_groups.append("line")
                .attr("class", "lz-data_layer-scatter-label");
            this.label_lines
                .attr({
                    "x1": function(d){
                        var x = data_layer.parent[x_scale](d[data_layer.layout.x_axis.field]);
                        if (isNaN(x)){ x = -1000; }
                        return x;
                    },
                    "y1": function(d){
                        var y = data_layer.parent[y_scale](d[data_layer.layout.y_axis.field]);
                        if (isNaN(y)){ y = -1000; }
                        return y;
                    },
                    "x2": function(d){
                        var x = data_layer.parent[x_scale](d[data_layer.layout.x_axis.field])
                              + (1.5 * Math.sqrt(data_layer.layout.point_size));
                        if (isNaN(x)){ x = -1000; }
                        return x;
                    },
                    "y2": function(d){
                        var y = data_layer.parent[y_scale](d[data_layer.layout.y_axis.field])
                              + Math.sqrt(data_layer.layout.point_size);
                        if (isNaN(y)){ y = -1000; }
                        return y;
                    },
                });
            this.label_groups.exit().remove();
        }

        // Generate main scatter data elements
        var selection = this.svg.group
            .selectAll("path.lz-data_layer-scatter")
            .data(this.data, function(d){ return d.id; });

        // Create elements, apply class and ID
        selection.enter()
            .append("path")
            .attr("class", "lz-data_layer-scatter")
            .attr("id", function(d){ return "s" + d.id.replace(/\W/g,""); });

        // Generate new values (or functions for them) for position, color, and shape
        var transform = function(d) {
            var x = this.parent[x_scale](d[this.layout.x_axis.field]);
            var y = this.parent[y_scale](d[this.layout.y_axis.field]);
            if (isNaN(x)){ x = -1000; }
            if (isNaN(y)){ y = -1000; }
            return "translate(" + x + "," + y + ")";
        }.bind(this);
        var fill;
        if (this.layout.color){
            switch (typeof this.layout.color){
            case "string":
                fill = this.layout.color;
                break;
            case "object":
                if (this.layout.color.scale_function && this.layout.color.field) {
                    fill = function(d){
                        return LocusZoom.ScaleFunctions.get(this.layout.color.scale_function,
                                                            this.layout.color.parameters || {},
                                                            d[this.layout.color.field]);
                    }.bind(this);
                }
                break;
            }
        }
        var shape = d3.svg.symbol().size(this.layout.point_size).type(this.layout.point_shape);

        // Apply position and color, using a transition if necessary
        if (this.layout.transition){
            selection
                .transition()
                .duration(this.layout.transition.duration || 0)
                .ease(this.layout.transition.ease || "cubic-in-out")
                .attr("transform", transform)
                .attr("fill", fill)
                .attr("d", shape);
        } else {
            selection
                .attr("transform", transform)
                .attr("fill", fill)
                .attr("d", shape);
        }

        // Apply selectable, tooltip, etc
        if (this.layout.selectable && (this.layout.fields.indexOf("id") != -1)){
            selection.on("mouseover", function(d){
                var id = "s" + d.id.replace(/\W/g,"");
                if (this.state[this.state_id].selected != id){
                    d3.select("#" + id).attr("class", "lz-data_layer-scatter lz-data_layer-scatter-hovered");
                    if (this.layout.tooltip){ this.createTooltip(d, id); }
                }
            }.bind(this))
            .on("mouseout", function(d){
                var id = "s" + d.id.replace(/\W/g,"");
                if (this.state[this.state_id].selected != id){
                    d3.select("#" + id).attr("class", "lz-data_layer-scatter");
                    if (this.layout.tooltip){ this.destroyTooltip(id); }
                }
            }.bind(this))
            .on("click", function(d){
                var id = "s" + d.id.replace(/\W/g,"");
                if (this.state[this.state_id].selected == id){
                    this.state[this.state_id].selected = null;
                    d3.select("#" + id).attr("class", "lz-data_layer-scatter lz-data_layer-scatter-hovered");
                } else {
                    if (this.state[this.state_id].selected != null){
                        d3.select("#" + this.state[this.state_id].selected).attr("class", "lz-data_layer-scatter");
                        if (this.layout.tooltip){ this.destroyTooltip(this.state[this.state_id].selected); }
                    }
                    this.state[this.state_id].selected = id;
                    d3.select("#" + id).attr("class", "lz-data_layer-scatter lz-data_layer-scatter-selected");
                }
                this.triggerOnUpdate();
            }.bind(this));

            // Apply existing elements from state
            if (this.state[this.state_id].selected != null){
                var selected_id = this.state[this.state_id].selected;
                if (d3.select("#" + selected_id).empty()){
                    console.warn("State elements for " + this.state_id + " contains an ID that is not or is no longer present on the plot: " + this.state[this.state_id].selected);
                    this.state[this.state_id].selected = null;
                } else {
                    if (this.tooltips[this.state[this.state_id].selected]){
                        this.positionTooltip(this.state[this.state_id].selected);
                    } else {
                        this.state[this.state_id].selected = null;
                        var d = d3.select("#" + selected_id).datum();
                        d3.select("#" + selected_id).on("mouseover")(d);
                        d3.select("#" + selected_id).on("click")(d);
                    }
                }
            }
        }

        // Remove old elements as needed
        selection.exit().remove();

        // Apply method to keep labels from overlapping each other
        if (this.layout.label){
            this.separate_labels();
        }
        
    };

    // Function to space labels apart immediately after initial render
    // Adapted from thudfactor's fiddle here: https://jsfiddle.net/thudfactor/HdwTH/
    // TODO: Make labels also aware of data elements
    this.separate_labels = function(){
        var data_layer = this;
        var alpha = 0.5;
        var padding = 2;
        var again = false;
        data_layer.label_texts.each(function (d, i) {
            a = this;
            da = d3.select(a);
            y1 = da.attr("y");
            data_layer.label_texts.each(function (d, j) {
                b = this;
                // a & b are the same element and don't collide.
                if (a == b) return;
                db = d3.select(b);
                // a & b are on opposite sides of the chart and
                // don't collide
                if (da.attr("text-anchor") != db.attr("text-anchor")) return;
                // Determine if the  bounding rects for the two text elements collide
                abound = da.node().getBoundingClientRect();
                bbound = db.node().getBoundingClientRect();
                var collision = abound.left < bbound.left + bbound.width + (2*padding) &&
                    abound.left + abound.width + (2*padding) > bbound.left &&
                    abound.top < bbound.top + bbound.height + (2*padding) &&
                    abound.height + abound.top + (2*padding) > bbound.top;
                if (!collision) return;
                
                // If the labels collide, we'll push each
                // of the two labels up and down a little bit.
                again = true;
                y2 = db.attr("y");
                sign = abound.top < bbound.top ? 1 : -1;
                adjust = sign * alpha;
                new_a_y = +y1 - adjust;
                new_b_y = +y2 + adjust;
                // Keep new values from extending outside the data layer
                var min_y = 2 * padding;
                var max_y = data_layer.parent.layout.height - data_layer.parent.layout.margin.top - data_layer.parent.layout.margin.bottom - (2 * padding);
                if (new_a_y - (abound.height/2) < min_y){
                    delta = +y1 - new_a_y;
                    new_a_y = +y1;
                    new_b_y += delta;
                } else if (new_b_y - (bbound.height/2) < min_y){
                    delta = +y2 - new_b_y;
                    new_b_y = +y2;
                    new_a_y += delta;
                }
                if (new_a_y + (abound.height/2) > max_y){
                    delta = new_a_y - +y1;
                    new_a_y = +y1;
                    new_b_y -= delta;
                } else if (new_b_y + (bbound.height/2) > max_y){
                    delta = new_b_y - +y2;
                    new_b_y = +y2;
                    new_a_y -= delta;
                }
                da.attr("y",new_a_y);
                db.attr("y",new_b_y);
            });
        });
        // Adjust our line leaders here
        // so that they follow the labels. 
        if (again) {
            labelElements = data_layer.label_texts[0];
            data_layer.label_lines.attr("y2",function(d,i) {
                labelForLine = d3.select(labelElements[i]);
                return labelForLine.attr("y");
            });
            this.separate_labels();
        }
    };
       
    return this;
});

/*********************
  Genes Data Layer
  Implements a data layer that will render gene tracks
*/

LocusZoom.DataLayers.add("genes", function(id, layout, parent){

    // Define a default layout for this DataLayer type and merge it with the passed argument
    this.DefaultLayout = {
        label_font_size: 12,
        label_exon_spacing: 4,
        exon_height: 16,
        bounding_box_padding: 6,
        track_vertical_spacing: 10,
        selectable: true
    };
    layout = LocusZoom.mergeLayouts(layout, this.DefaultLayout);

    // Apply the arguments to set LocusZoom.DataLayer as the prototype
    LocusZoom.DataLayer.apply(this, arguments);
    
    // Helper function to sum layout values to derive total height for a single gene track
    this.getTrackHeight = function(){
        return 2 * this.layout.bounding_box_padding
            + this.layout.label_font_size
            + this.layout.label_exon_spacing
            + this.layout.exon_height
            + this.layout.track_vertical_spacing;
    };

    // A gene may have arbitrarily many transcripts, but this data layer isn't set up to render them yet.
    // Stash a transcript_idx to point to the first transcript and use that for all transcript refs.
    this.transcript_idx = 0;
    
    this.tracks = 1;
    this.gene_track_index = { 1: [] }; // track-number-indexed object with arrays of gene indexes in the dataset

    // After we've loaded the genes interpret them to assign
    // each to a track so that they do not overlap in the view
    this.assignTracks = function(){

        // Function to get the width in pixels of a label given the text and layout attributes
        this.getLabelWidth = function(gene_name, font_size){
            var temp_text = this.svg.group.append("text")
                .attr("x", 0).attr("y", 0).attr("class", "lz-data_layer-gene lz-label")
                .style("font-size", font_size)
                .text(gene_name + "→");
            var label_width = temp_text.node().getBBox().width;
            temp_text.node().remove();
            return label_width;
        };

        // Reinitialize some metadata
        this.tracks = 1;
        this.gene_track_index = { 1: [] };

        this.data.map(function(d, g){

            // If necessary, split combined gene id / version fields into discrete fields.
            // NOTE: this may be an issue with CSG's genes data source that may eventually be solved upstream.
            if (this.data[g].gene_id && this.data[g].gene_id.indexOf(".")){
                var split = this.data[g].gene_id.split(".");
                this.data[g].gene_id = split[0];
                this.data[g].gene_version = split[1];
            }

            // Stash the transcript ID on the parent gene
            this.data[g].transcript_id = this.data[g].transcripts[this.transcript_idx].transcript_id;

            // Determine display range start and end, based on minimum allowable gene display width, bounded by what we can see
            // (range: values in terms of pixels on the screen)
            this.data[g].display_range = {
                start: this.parent.x_scale(Math.max(d.start, this.state.start)),
                end:   this.parent.x_scale(Math.min(d.end, this.state.end))
            };
            this.data[g].display_range.label_width = this.getLabelWidth(this.data[g].gene_name, this.layout.label_font_size);
            this.data[g].display_range.width = this.data[g].display_range.end - this.data[g].display_range.start;
            // Determine label text anchor (default to middle)
            this.data[g].display_range.text_anchor = "middle";
            if (this.data[g].display_range.width < this.data[g].display_range.label_width){
                if (d.start < this.state.start){
                    this.data[g].display_range.end = this.data[g].display_range.start
                        + this.data[g].display_range.label_width
                        + this.layout.label_font_size;
                    this.data[g].display_range.text_anchor = "start";
                } else if (d.end > this.state.end){
                    this.data[g].display_range.start = this.data[g].display_range.end
                        - this.data[g].display_range.label_width
                        - this.layout.label_font_size;
                    this.data[g].display_range.text_anchor = "end";
                } else {
                    var centered_margin = ((this.data[g].display_range.label_width - this.data[g].display_range.width) / 2)
                        + this.layout.label_font_size;
                    if ((this.data[g].display_range.start - centered_margin) < this.parent.x_scale(this.state.start)){
                        this.data[g].display_range.start = this.parent.x_scale(this.state.start);
                        this.data[g].display_range.end = this.data[g].display_range.start + this.data[g].display_range.label_width;
                        this.data[g].display_range.text_anchor = "start";
                    } else if ((this.data[g].display_range.end + centered_margin) > this.parent.x_scale(this.state.end)) {
                        this.data[g].display_range.end = this.parent.x_scale(this.state.end);
                        this.data[g].display_range.start = this.data[g].display_range.end - this.data[g].display_range.label_width;
                        this.data[g].display_range.text_anchor = "end";
                    } else {
                        this.data[g].display_range.start -= centered_margin;
                        this.data[g].display_range.end += centered_margin;
                    }
                }
                this.data[g].display_range.width = this.data[g].display_range.end - this.data[g].display_range.start;
            }
            // Add bounding box padding to the calculated display range start, end, and width
            this.data[g].display_range.start -= this.layout.bounding_box_padding;
            this.data[g].display_range.end   += this.layout.bounding_box_padding;
            this.data[g].display_range.width += 2 * this.layout.bounding_box_padding;
            // Convert and stash display range values into domain values
            // (domain: values in terms of the data set, e.g. megabases)
            this.data[g].display_domain = {
                start: this.parent.x_scale.invert(this.data[g].display_range.start),
                end:   this.parent.x_scale.invert(this.data[g].display_range.end)
            };
            this.data[g].display_domain.width = this.data[g].display_domain.end - this.data[g].display_domain.start;

            // Using display range/domain data generated above cast each gene to tracks such that none overlap
            this.data[g].track = null;
            var potential_track = 1;
            while (this.data[g].track == null){
                var collision_on_potential_track = false;
                this.gene_track_index[potential_track].map(function(placed_gene){
                    if (!collision_on_potential_track){
                        var min_start = Math.min(placed_gene.display_range.start, this.display_range.start);
                        var max_end = Math.max(placed_gene.display_range.end, this.display_range.end);
                        if ((max_end - min_start) < (placed_gene.display_range.width + this.display_range.width)){
                            collision_on_potential_track = true;
                        }
                    }
                }.bind(this.data[g]));
                if (!collision_on_potential_track){
                    this.data[g].track = potential_track;
                    this.gene_track_index[potential_track].push(this.data[g]);
                } else {
                    potential_track++;
                    if (potential_track > this.tracks){
                        this.tracks = potential_track;
                        this.gene_track_index[potential_track] = [];
                    }
                }
            }

            // Stash parent references on all genes, trascripts, and exons
            this.data[g].parent = this;
            this.data[g].transcripts.map(function(d, t){
                this.data[g].transcripts[t].parent = this.data[g];
                this.data[g].transcripts[t].exons.map(function(d, e){
                    this.data[g].transcripts[t].exons[e].parent = this.data[g].transcripts[t];
                }.bind(this));
            }.bind(this));

        }.bind(this));
        return this;
    };

    // Implement the main render function
    this.render = function(){

        this.assignTracks();

        // Render gene groups
        var selection = this.svg.group.selectAll("g.lz-data_layer-gene")
            .data(this.data, function(d){ return d.gene_name; });

        selection.enter().append("g")
            .attr("class", "lz-data_layer-gene");

        selection.attr("id", function(d){ return "g" + d.gene_name.replace(/\W/g,""); })
            .each(function(gene){

                var data_layer = gene.parent;

                // Render gene bounding box
                var bboxes = d3.select(this).selectAll("rect.lz-data_layer-gene.lz-bounding_box")
                    .data([gene], function(d){ return d.gene_name + "_bbox"; });

                bboxes.enter().append("rect")
                    .attr("class", "lz-data_layer-gene lz-bounding_box");

                bboxes
                    .attr("id", function(d){
                        return "g" + d.gene_name.replace(/\W/g,"") + "_bounding_box";
                    })
                    .attr("x", function(d){
                        return d.display_range.start;
                    })
                    .attr("y", function(d){
                        return ((d.track-1) * data_layer.getTrackHeight());
                    })
                    .attr("width", function(d){
                        return d.display_range.width;
                    })
                    .attr("height", function(){
                        return data_layer.getTrackHeight() - data_layer.layout.track_vertical_spacing;
                    })
                    .attr("rx", function(){
                        return data_layer.layout.bounding_box_padding;
                    })
                    .attr("ry", function(){
                        return data_layer.layout.bounding_box_padding;
                    });

                bboxes.exit().remove();

                // Render gene boundaries
                var boundaries = d3.select(this).selectAll("rect.lz-data_layer-gene.lz-boundary")
                    .data([gene], function(d){ return d.gene_name + "_boundary"; });

                boundaries.enter().append("rect")
                    .attr("class", "lz-data_layer-gene lz-boundary");

                boundaries
                    .attr("x", function(d){
                        return data_layer.parent.x_scale(d.start);
                    })
                    .attr("y", function(d){
                        return ((d.track-1) * data_layer.getTrackHeight())
                            + data_layer.layout.bounding_box_padding
                            + data_layer.layout.label_font_size
                            + data_layer.layout.label_exon_spacing
                            + (Math.max(data_layer.layout.exon_height, 3) / 2);
                    })
                    .attr("width", function(d){
                        return data_layer.parent.x_scale(d.end) - data_layer.parent.x_scale(d.start);
                    })
                    .attr("height", 1); // This should be scaled dynamically somehow

                boundaries.exit().remove();

                // Render gene labels
                var labels = d3.select(this).selectAll("text.lz-data_layer-gene.lz-label")
                    .data([gene], function(d){ return d.gene_name + "_label"; });

                labels.enter().append("text")
                    .attr("class", "lz-data_layer-gene lz-label");

                labels
                    .attr("x", function(d){
                        if (d.display_range.text_anchor == "middle"){
                            return d.display_range.start + (d.display_range.width / 2);
                        } else if (d.display_range.text_anchor == "start"){
                            return d.display_range.start + data_layer.layout.bounding_box_padding;
                        } else if (d.display_range.text_anchor == "end"){
                            return d.display_range.end - data_layer.layout.bounding_box_padding;
                        }
                    })
                    .attr("y", function(d){
                        return ((d.track-1) * data_layer.getTrackHeight())
                            + data_layer.layout.bounding_box_padding
                            + data_layer.layout.label_font_size;
                    })
                    .attr("text-anchor", function(d){
                        return d.display_range.text_anchor;
                    })
                    .text(function(d){
                        return (d.strand == "+") ? d.gene_name + "→" : "←" + d.gene_name;
                    })
                    .style("font-size", gene.parent.layout.label_font_size);

                labels.exit().remove();

                // Render exon rects (first transcript only, for now)
                var exons = d3.select(this).selectAll("rect.lz-data_layer-gene.lz-exon")
                    .data(gene.transcripts[gene.parent.transcript_idx].exons, function(d){ return d.exon_id; });
                        
                exons.enter().append("rect")
                    .attr("class", "lz-data_layer-gene lz-exon");
                        
                exons
                    .attr("x", function(d){
                        return data_layer.parent.x_scale(d.start);
                    })
                    .attr("y", function(){
                        return ((gene.track-1) * data_layer.getTrackHeight())
                            + data_layer.layout.bounding_box_padding
                            + data_layer.layout.label_font_size
                            + data_layer.layout.label_exon_spacing;
                    })
                    .attr("width", function(d){
                        return data_layer.parent.x_scale(d.end) - data_layer.parent.x_scale(d.start);
                    })
                    .attr("height", function(){
                        return data_layer.layout.exon_height;
                    });

                exons.exit().remove();

                // Render gene click area
                var clickareas = d3.select(this).selectAll("rect.lz-data_layer-gene.lz-clickarea")
                    .data([gene], function(d){ return d.gene_name + "_clickarea"; });

                clickareas.enter().append("rect")
                    .attr("class", "lz-data_layer-gene lz-clickarea");

                clickareas
                    .attr("id", function(d){
                        return "g" + d.gene_name.replace(/\W/g,"") + "_clickarea";
                    })
                    .attr("x", function(d){
                        return d.display_range.start;
                    })
                    .attr("y", function(d){
                        return ((d.track-1) * data_layer.getTrackHeight());
                    })
                    .attr("width", function(d){
                        return d.display_range.width;
                    })
                    .attr("height", function(){
                        return data_layer.getTrackHeight() - data_layer.layout.track_vertical_spacing;
                    })
                    .attr("rx", function(){
                        return data_layer.layout.bounding_box_padding;
                    })
                    .attr("ry", function(){
                        return data_layer.layout.bounding_box_padding;
                    });

                // Remove old clickareas as needed
                clickareas.exit().remove();

                // Apply selectable, tooltip, etc. to clickareas
                if (gene.parent.layout.selectable){
                    clickareas
                        .on("mouseover", function(d){
                            var id = "g" + d.gene_name.replace(/\W/g,"");
                            if (data_layer.state[data_layer.state_id].selected != id){
                                d3.select("#" + id + "_bounding_box").attr("class", "lz-data_layer-gene lz-bounding_box lz-bounding_box-hovered");
                                if (data_layer.layout.tooltip){ data_layer.createTooltip(d, id); }
                            }
                        })
                        .on("mouseout", function(d){
                            var id = "g" + d.gene_name.replace(/\W/g,"");
                            if (data_layer.state[data_layer.state_id].selected != id){
                                d3.select("#" + id + "_bounding_box").attr("class", "lz-data_layer-gene lz-bounding_box");
                                if (data_layer.layout.tooltip){ data_layer.destroyTooltip(id); }
                            }
                        })
                        .on("click", function(d){
                            var id = "g" + d.gene_name.replace(/\W/g,"");
                            if (data_layer.state[data_layer.state_id].selected == id){
                                data_layer.state[data_layer.state_id].selected = null;
                                d3.select("#" + id + "_bounding_box").attr("class", "lz-data_layer-gene lz-bounding_box lz-bounding_box-hovered");
                            } else {
                                if (data_layer.state[data_layer.state_id].selected != null){
                                    d3.select("#" + data_layer.state[data_layer.state_id].selected + "_bounding_box").attr("class", "lz-data_layer-gene lz-bounding_box");
                                    if (data_layer.layout.tooltip){ data_layer.destroyTooltip(data_layer.state[data_layer.state_id].selected); }
                                }
                                data_layer.state[data_layer.state_id].selected = id;
                                d3.select("#" + id + "_bounding_box").attr("class", "lz-data_layer-gene lz-bounding_box lz-bounding_box-selected");
                            }
                            data_layer.triggerOnUpdate();
                        });
                    // Apply existing selection from state
                    if (gene.parent.state[gene.parent.state_id].selected != null){
                        var selected_id = gene.parent.state[gene.parent.state_id].selected + "_clickarea";
                        if (d3.select("#" + selected_id).empty()){
                            console.warn("Pre-defined state selection for " + gene.parent.state_id + " contains an ID that is not or is no longer present on the plot: " + gene.parent.state[gene.parent.state_id].selected);
                            gene.parent.state[gene.parent.state_id].selected = null;
                        } else {
                            if (gene.parent.tooltips[gene.parent.state[gene.parent.state_id].selected]){
                                gene.parent.positionTooltip(gene.parent.state[gene.parent.state_id].selected);
                            } else {
                                gene.parent.state[gene.parent.state_id].selected = null;
                                var d = d3.select("#" + selected_id).datum();
                                d3.select("#" + selected_id).on("mouseover")(d);
                                d3.select("#" + selected_id).on("click")(d);
                            }
                        }
                    }
                }

            });

        // Remove old elements as needed
        selection.exit().remove();

    };

    // Reimplement the positionTooltip() method to be gene-specific
    this.positionTooltip = function(id){
        if (typeof id != "string"){
            throw ("Unable to position tooltip: id is not a string");
        }
        if (!this.tooltips[id]){
            throw ("Unable to position tooltip: id does not point to a valid tooltip");
        }
        var tooltip = this.tooltips[id];
        var arrow_width = 7; // as defined in the default stylesheet
        var stroke_width = 1; // as defined in the default stylesheet
        var page_origin = this.getPageOrigin();
        var tooltip_box = tooltip.selector.node().getBoundingClientRect();
        var gene_bbox = d3.select("#g" + tooltip.data.gene_name.replace(/\W/g,"")).node().getBBox();
        var data_layer_height = this.parent.layout.height - (this.parent.layout.margin.top + this.parent.layout.margin.bottom);
        var data_layer_width = this.parent.layout.width - (this.parent.layout.margin.left + this.parent.layout.margin.right);
        // Position horizontally: attempt to center on the portion of the gene that's visible,
        // pad to either side if bumping up against the edge of the data layer
        var gene_center_x = ((tooltip.data.display_range.start + tooltip.data.display_range.end) / 2) - (this.layout.bounding_box_padding / 2);
        var offset_right = Math.max((tooltip_box.width / 2) - gene_center_x, 0);
        var offset_left = Math.max((tooltip_box.width / 2) + gene_center_x - data_layer_width, 0);
        var left = page_origin.x + gene_center_x - (tooltip_box.width / 2) - offset_left + offset_right;
        var arrow_left = (tooltip_box.width / 2) - (arrow_width / 2) + offset_left - offset_right;
        // Position vertically below the gene unless there's insufficient space
        var top, arrow_type, arrow_top;
        if (tooltip_box.height + stroke_width + arrow_width > data_layer_height - (gene_bbox.y + gene_bbox.height)){
            top = page_origin.y + gene_bbox.y - (tooltip_box.height + stroke_width + arrow_width);
            arrow_type = "down";
            arrow_top = tooltip_box.height - stroke_width;
        } else {
            top = page_origin.y + gene_bbox.y + gene_bbox.height + stroke_width + arrow_width;
            arrow_type = "up";
            arrow_top = 0 - stroke_width - arrow_width;
        }
        // Apply positions to the main div
        tooltip.selector.style("left", left + "px").style("top", top + "px");
        // Create / update position on arrow connecting tooltip to data
        if (!tooltip.arrow){
            tooltip.arrow = tooltip.selector.append("div").style("position", "absolute");
        }
        tooltip.arrow
            .attr("class", "lz-data_layer-tooltip-arrow_" + arrow_type)
            .style("left", arrow_left + "px")
            .style("top", arrow_top + "px");
    };
       
    return this;
});
