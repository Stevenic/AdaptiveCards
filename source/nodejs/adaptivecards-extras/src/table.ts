import { Container, property, SerializableObject, SerializableObjectCollectionProperty, SerializationContext,
    Strings, ValidationEvent, Versions, TypeErrorType, CardElement, StylableCardElementContainer, PropertyBag, SizeAndUnit,
    CustomProperty, PropertyDefinition, BaseSerializationContext, SizeUnit, BoolProperty, PaddingDefinition, Spacing,
    VerticalAlignment, EnumProperty, ContainerStyleProperty, stringToCssColor, NumProperty, TextStyleDefinition, HorizontalAlignment } from "adaptivecards";

export class ColumnDefinition extends SerializableObject {
    //#region Schema

    static readonly horizontalCellContentAlignmentProperty = new EnumProperty(Versions.v1_0, "horizontalCellContentAlignment", HorizontalAlignment);
    static readonly verticalCellContentAlignmentProperty = new EnumProperty(Versions.v1_0, "verticalCellContentAlignment", VerticalAlignment);

    static readonly widthProperty = new CustomProperty<SizeAndUnit>(
        Versions.v1_0,
        "width",
        (sender: SerializableObject, property: PropertyDefinition, source: PropertyBag, context: BaseSerializationContext) => {
            let result: SizeAndUnit = property.defaultValue;
            let value = source[property.name];
            let invalidWidth = false;

            if (typeof value === "number" && !isNaN(value)) {
                result = new SizeAndUnit(value, SizeUnit.Weight);
            }
            else if (typeof value === "string") {
                try {
                    result = SizeAndUnit.parse(value);
                }
                catch (e) {
                    invalidWidth = true;
                }
            }
            else {
                invalidWidth = true;
            }

            if (invalidWidth) {
                context.logParseEvent(
                    sender,
                    ValidationEvent.InvalidPropertyValue,
                    Strings.errors.invalidColumnWidth(value));
            }

            return result;
        },
        (sender: SerializableObject, property: PropertyDefinition, target: PropertyBag, value: SizeAndUnit, context: BaseSerializationContext) => {
            if (value.unit === SizeUnit.Pixel) {
                context.serializeValue(target, "width", value.physicalSize + "px");
            }
            else {
                context.serializeNumber(target, "width", value.physicalSize);
            }
        },
        new SizeAndUnit(1, SizeUnit.Weight));

    @property(ColumnDefinition.horizontalCellContentAlignmentProperty)
    horizontalCellContentAlignment?: HorizontalAlignment;

    @property(ColumnDefinition.verticalCellContentAlignmentProperty)
    verticalCellContentAlignment?: VerticalAlignment;

    @property(ColumnDefinition.widthProperty)
    width: SizeAndUnit = new SizeAndUnit(1, SizeUnit.Weight);

    getSchemaKey(): string {
        return "ColumnDefinition";
    }

    //#endregion

    computedWidth: SizeAndUnit;
}

export abstract class StylableContainer<T extends CardElement> extends StylableCardElementContainer {
    private _items: T[] = [];

    private parseItem(source: any, context: SerializationContext): T | undefined {
        return context.parseCardObject<T>(
            this,
            source,
            [], // Forbidden types not supported for elements for now
            !this.isDesignMode(),
            (typeName: string) => {
                return this.createItemInstance(typeName);
            },
            (typeName: string, errorType: TypeErrorType) => {
                context.logParseEvent(
                    undefined,
                    ValidationEvent.ElementTypeNotAllowed,
                    Strings.errors.elementTypeNotAllowed(typeName));
            });
    }

    protected abstract getCollectionPropertyName(): string;
    protected abstract createItemInstance(typeName: string): T | undefined;

    protected internalAddItem(item: T) {
        if (!item.parent) {
            this._items.push(item);

            item.setParent(this);
        }
        else {
            throw new Error(Strings.errors.elementAlreadyParented());
        }
    }

    protected internalRemoveItem(item: T): boolean {
        let itemIndex = this._items.indexOf(item);

        if (itemIndex >= 0) {
            this._items.splice(itemIndex, 1);

            item.setParent(undefined);

            this.updateLayout();

            return true;
        }

        return false;
    }

    protected internalParse(source: any, context: SerializationContext) {
        super.internalParse(source, context);

        this._items = [];

        let items = source[this.getCollectionPropertyName()];

        if (Array.isArray(items)) {
            for (let item of items) {
                let instance = this.parseItem(item, context);

                if (instance) {
                    this._items.push(instance);
                }
            }
        }
    }

    protected internalToJSON(target: PropertyBag, context: SerializationContext) {
        super.internalToJSON(target, context);

        context.serializeArray(target, this.getCollectionPropertyName(), this._items);
    }

    removeItem(item: T): boolean {
        return this.internalRemoveItem(item);
    }

    getItemCount(): number {
        return this._items.length;
    }

    getItemAt(index: number): T {
        return this._items[index];
    }

    getFirstVisibleRenderedItem(): T | undefined {
        return this.getItemCount() > 0 ? this.getItemAt(0) : undefined;
    }

    getLastVisibleRenderedItem(): T | undefined {
        return this.getItemCount() > 0 ? this.getItemAt(this.getItemCount() - 1) : undefined;
    }
}

export type CellType = "data" | "header";

export class TableCell extends Container {
    private _columnIndex: number = -1;
    private _cellType: CellType = "data";

    protected getHasBorder(): boolean {
        return this.parentRow.parentTable.showGridLines;
    }

    protected applyBorder() {
        if (this.renderedElement && this.getHasBorder()) {
            let styleDefinition = this.hostConfig.containerStyles.getStyleByName(this.parentRow.parentTable.gridStyle);

            if (styleDefinition.borderColor) {
                const borderColor = <string>stringToCssColor(styleDefinition.borderColor);

                if (borderColor) {
                    this.renderedElement.style.borderRight = "1px solid " + borderColor;
                    this.renderedElement.style.borderBottom = "1px solid " + borderColor;
                }
            }
        }
    }

    protected getDefaultPadding(): PaddingDefinition {
        return this.getHasBackground() || this.getHasBorder() ?
            new PaddingDefinition(
                Spacing.Small,
                Spacing.Small,
                Spacing.Small,
                Spacing.Small) : super.getDefaultPadding();
    }

    protected internalRender(): HTMLElement | undefined {
        let cellElement = super.internalRender();

        if (cellElement) {
            cellElement.setAttribute("role", this.cellType === "data" ? "cell" : "columnheader");
            cellElement.style.minWidth = "0";

            if (this.cellType === "header") {
                cellElement.setAttribute("scope", "col");
            }
        }

        return cellElement;
    }

    protected shouldSerialize(context: SerializationContext): boolean {
        return true;
    }

    getJsonTypeName(): string {
        return "TableCell";
    }

    getEffectiveTextStyleDefinition(): TextStyleDefinition {
        if (this.cellType === "header") {
            return this.hostConfig.textStyles.columnHeader;
        }

        return super.getEffectiveTextStyleDefinition();
    }

    getEffectiveHorizontalAlignment(): HorizontalAlignment {
        if (this.horizontalAlignment !== undefined) {
            return this.horizontalAlignment;
        }

        if (this.parentRow.horizontalCellContentAlignment !== undefined) {
            return this.parentRow.horizontalCellContentAlignment;
        }

        if (this.columnIndex >= 0) {
            let horizontalAlignment = this.parentRow.parentTable.getColumnAt(this.columnIndex).horizontalCellContentAlignment;

            if (horizontalAlignment !== undefined) {
                return horizontalAlignment;
            }
        }

        if (this.parentRow.parentTable.horizontalCellContentAlignment !== undefined) {
            return this.parentRow.parentTable.horizontalCellContentAlignment;
        }

        return super.getEffectiveHorizontalAlignment();
    }

    getEffectiveVerticalContentAlignment(): VerticalAlignment {
        if (this.verticalContentAlignment !== undefined) {
            return this.verticalContentAlignment;
        }

        if (this.parentRow.verticalCellContentAlignment !== undefined) {
            return this.parentRow.verticalCellContentAlignment;
        }

        if (this.columnIndex >= 0) {
            let verticalAlignment = this.parentRow.parentTable.getColumnAt(this.columnIndex).verticalCellContentAlignment;

            if (verticalAlignment !== undefined) {
                return verticalAlignment;
            }
        }

        if (this.parentRow.parentTable.verticalCellContentAlignment !== undefined) {
            return this.parentRow.parentTable.verticalCellContentAlignment;
        }

        return super.getEffectiveVerticalContentAlignment();
    }

    get columnIndex(): number {
        return this._columnIndex;
    }

    get cellType(): CellType {
        return this._cellType;
    }

    get parentRow(): TableRow {
        return this.parent as TableRow;
    }

    get isStandalone(): boolean {
        return false;
    }
}

export class TableRow extends StylableContainer<TableCell> {
    //#region Schema

    static readonly styleProperty = new ContainerStyleProperty(Versions.v1_0, "style");
    static readonly horizontalCellContentAlignmentProperty = new EnumProperty(Versions.v1_0, "horizontalCellContentAlignment", HorizontalAlignment);
    static readonly verticalCellContentAlignmentProperty = new EnumProperty(Versions.v1_0, "verticalCellContentAlignment", VerticalAlignment);

    @property(TableRow.horizontalCellContentAlignmentProperty)
    horizontalCellContentAlignment?: HorizontalAlignment;

    @property(TableRow.verticalCellContentAlignmentProperty)
    verticalCellContentAlignment?: VerticalAlignment;

    //#endregion

    protected getDefaultPadding(): PaddingDefinition {
        return new PaddingDefinition(
            Spacing.None,
            Spacing.None,
            Spacing.None,
            Spacing.None);
    }

    protected applyBackground() {
        if (this.renderedElement) {
            let styleDefinition = this.hostConfig.containerStyles.getStyleByName(this.style, this.hostConfig.containerStyles.getStyleByName(this.defaultStyle));

            if (styleDefinition.backgroundColor) {
                const bgColor = <string>stringToCssColor(styleDefinition.backgroundColor);
                this.renderedElement.style.backgroundColor = bgColor;
            }
        }
    }

    protected getCollectionPropertyName(): string {
        return "cells";
    }

    protected createItemInstance(typeName: string): TableCell | undefined {
        return !typeName || typeName === "TableCell" ? new TableCell() : undefined;
    }
    
    protected internalRender(): HTMLElement | undefined {
        let isFirstRow = this.getIsFirstRow();
        let cellSpacing = this.hostConfig.table.cellSpacing;

        let rowElement = document.createElement("div");
        rowElement.setAttribute("role", "row");
        rowElement.style.display = "flex";
        rowElement.style.flexDirection = "row";

        for (let i = 0; i < Math.min(this.getItemCount(), this.parentTable.getColumnCount()); i++) {
            let cell = this.getItemAt(i);

            // Cheating a bit in order to keep cellType read-only
            cell["_columnIndex"] = i;
            cell["_cellType"] = (this.parentTable.firstRowAsHeaders && isFirstRow) ? "header" : "data";

            let renderedCell = cell.render();

            if (renderedCell) {
                let column = this.parentTable.getColumnAt(i);

                if (column.computedWidth.unit === SizeUnit.Pixel) {
                    renderedCell.style.flex = "0 0 " + column.computedWidth.physicalSize + "px";
                }
                else {
                    renderedCell.style.flex = "1 1 " + column.computedWidth.physicalSize + "%";
                }

                if (i > 0 && !this.parentTable.showGridLines && cellSpacing > 0) {
                    renderedCell.style.marginLeft = cellSpacing + "px";
                }

                rowElement.appendChild(renderedCell);
            }
        }

        return rowElement.children.length > 0 ? rowElement : undefined;
    }

    protected shouldSerialize(context: SerializationContext): boolean {
        return true;
    }

    addCell(cell: TableCell) {
        this.internalAddItem(cell);
    }

    ensureHasEnoughCells(cellCount: number) {
        while (this.getItemCount() < cellCount) {
            this.addCell(new TableCell());
        }
    }

    getJsonTypeName(): string {
        return "TableRow";
    }

    getIsFirstRow(): boolean {
        return this.parentTable.getItemAt(0) === this;
    }

    get parentTable(): Table {
        return this.parent as Table;
    }

    get isStandalone(): boolean {
        return false;
    }
}

export class Table extends StylableContainer<TableRow> {
    //#region Schema

    private static readonly columnsProperty = new SerializableObjectCollectionProperty(Versions.v1_0, "columns", ColumnDefinition);

    static readonly firstRowAsHeadersProperty = new BoolProperty(Versions.v1_0, "firstRowAsHeaders", true);
    static readonly showGridLinesProperty = new BoolProperty(Versions.v1_0, "showGridLines", true);
    static readonly gridStyleProperty = new ContainerStyleProperty(Versions.v1_0, "gridStyle");
    static readonly horizontalCellContentAlignmentProperty = new EnumProperty(Versions.v1_0, "horizontalCellContentAlignment", HorizontalAlignment);
    static readonly verticalCellContentAlignmentProperty = new EnumProperty(Versions.v1_0, "verticalCellContentAlignment", VerticalAlignment);

    @property(Table.columnsProperty)
    private _columns: ColumnDefinition[] = [];

    @property(Table.firstRowAsHeadersProperty)
    firstRowAsHeaders: boolean = true;

    @property(Table.showGridLinesProperty)
    showGridLines: boolean = true;

    @property(Table.gridStyleProperty)
    get gridStyle(): string | undefined {
        let style = this.getValue(Table.gridStyleProperty);

        if (style && this.hostConfig.containerStyles.getStyleByName(style)) {
            return style;
        }

        return undefined;
    }

    set gridStyle(value: string | undefined) {
        this.setValue(Table.gridStyleProperty, value);
    }

    @property(Table.horizontalCellContentAlignmentProperty)
    horizontalCellContentAlignment?: HorizontalAlignment;

    @property(Table.verticalCellContentAlignmentProperty)
    verticalCellContentAlignment?: VerticalAlignment;

    //#endregion

    private ensureRowsHaveEnoughCells() {
        for (let i = 0; i < this.getItemCount(); i++) {
            this.getItemAt(i).ensureHasEnoughCells(this.getColumnCount());
        }
    }

    protected getCollectionPropertyName(): string {
        return "rows";
    }

    protected createItemInstance(typeName: string): TableRow | undefined {
        return !typeName || typeName === "TableRow" ? new TableRow() : undefined;
    }

    protected internalParse(source: PropertyBag, context: SerializationContext) {
        super.internalParse(source, context);

        this.ensureRowsHaveEnoughCells();
    }

    protected internalRender(): HTMLElement | undefined {
        if (this.getItemCount() > 0) {
            let totalWeights: number = 0;

            for (let column of this._columns) {
                if (column.width.unit === SizeUnit.Weight) {
                    totalWeights += column.width.physicalSize;
                }
            }

            for (let column of this._columns) {
                if (column.width.unit === SizeUnit.Pixel) {
                    column.computedWidth = new SizeAndUnit(column.width.physicalSize, SizeUnit.Pixel);
                }
                else {
                    column.computedWidth = new SizeAndUnit(100 / totalWeights * column.width.physicalSize, SizeUnit.Weight);
                }
            }

            let tableElement = document.createElement("div");
            tableElement.setAttribute("role", "table");
            tableElement.style.display = "flex";
            tableElement.style.flexDirection = "column";

            if (this.showGridLines) {
                let styleDefinition = this.hostConfig.containerStyles.getStyleByName(this.gridStyle);

                if (styleDefinition.borderColor) {
                    const borderColor = <string>stringToCssColor(styleDefinition.borderColor);
    
                    if (borderColor) {
                        tableElement.style.borderTop = "1px solid " + borderColor;
                        tableElement.style.borderLeft = "1px solid " + borderColor;
                    }
                }
            }

            let cellSpacing = this.hostConfig.table.cellSpacing;

            for (let i = 0; i < this.getItemCount(); i++) {
                let renderedRow = this.getItemAt(i).render();

                if (renderedRow) {
                    if (i > 0 && !this.showGridLines && cellSpacing > 0) {
                        let separatorRow = document.createElement("div");
                        separatorRow.setAttribute("aria-hidden", "true");
                        separatorRow.style.height = cellSpacing + "px";

                        tableElement.appendChild(separatorRow);
                    }

                    tableElement.appendChild(renderedRow);
                }
            }

            return tableElement;
        }

        return undefined;
    }

    addColumn(column: ColumnDefinition) {
        this._columns.push(column);

        this.ensureRowsHaveEnoughCells();
    }

    getColumnCount(): number {
        return this._columns.length;
    }

    getColumnAt(index: number): ColumnDefinition {
        return this._columns[index];
    }

    addRow(row: TableRow) {
        this.internalAddItem(row);

        row.ensureHasEnoughCells(this.getColumnCount());
    }

    getJsonTypeName(): string {
        return "Table";
    }
}