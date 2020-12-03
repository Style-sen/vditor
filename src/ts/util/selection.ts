import {Constants} from "../constants";
import {isChrome} from "./compatibility";
import {hasClosestBlock, hasClosestByClassName} from "./hasClosest";
import {diff_match_patch} from "diff-match-patch";

export const getEditorRange = (element: HTMLElement) => {
    let range: Range;
    if (getSelection().rangeCount > 0) {
        range = getSelection().getRangeAt(0);
        if (element.isEqualNode(range.startContainer) || element.contains(range.startContainer)) {
            return range;
        }
    }
    element.focus();
    range = element.ownerDocument.createRange();
    range.setStart(element, 0);
    range.collapse(true);
    return range;
};

interface selectionPosition {
    left: number,
    top: number
}

export interface selectionOldInfo  {
    rangeEndContainer: Node,
    rangeEndOffset: number,
    rangeEndContainerPositon:selectionPosition
}

export const getSelectionInfo = (editor: HTMLElement)=> {
    const selection = window.getSelection();
    if(selection.rangeCount === 0){
        return {};
    }
    const range = selection.getRangeAt(0);
    const parentRect = editor.parentElement.getBoundingClientRect();
    // 获取endContainer和endOffset的值
    let cursorRect = range.getClientRects()[0] || parentRect;
    return {
        rangeEndContainer: range.endContainer,
        rangeEndOffset: range.endOffset,
        rangeEndContainerPositon: {
            left: cursorRect.left - parentRect.left,
            top: cursorRect.top - parentRect.top,
        }
    }
}

export const setSelectionByOldinfo = (editor: HTMLElement, oldInfo:selectionOldInfo)=>{
    //优先级：父子都相同》父相同》子相同
    // 首先判断parentElement内容是否相同
    // 然后再同步判断node是否相同，遇到父子都相同的
    var newRange = document.createRange();
    const newRangePriority: Range|unknown[] = [];
    // positon
    const parentRect = editor.parentElement.getBoundingClientRect();
    var oldDistance = oldInfo.rangeEndContainerPositon.top * parentRect.width + oldInfo.rangeEndContainerPositon.left;
    var sonDistance = 0;
    var noneDistance = 0;
    var equalCharsSum = 0;
    if(editor.childElementCount > 0){
        var tmp:diff_match_patch = new diff_match_patch();
        editor.childNodes.forEach((sonNode)=>{
            if(sonNode.textContent === oldInfo.rangeEndContainer.parentElement.textContent){
                sonNode.childNodes.forEach((grandSonNode)=>{
                    const index =  grandSonNode.textContent.indexOf(oldInfo.rangeEndContainer.textContent);
                    if(grandSonNode.textContent === oldInfo.rangeEndContainer.textContent){
                        newRange.setStart(grandSonNode,oldInfo.rangeEndOffset);
                        newRangePriority[0] = newRange;
                    }else if(index>-1){
                        newRange.setStart(grandSonNode, oldInfo.rangeEndOffset + index);
                        newRangePriority[1] = newRange;
                    }
                })
            }
            else if(sonNode.textContent.indexOf(oldInfo.rangeEndContainer.parentElement.textContent)>-1){
                sonNode.childNodes.forEach((grandSonNode) => {
                    const index =  grandSonNode.textContent.indexOf(oldInfo.rangeEndContainer.textContent);
                    if( index > -1){
                        newRange.setStart(grandSonNode, oldInfo.rangeEndOffset + index);
                        newRangePriority[2] = newRange;
                    }
                })
            }
            else if(sonNode.textContent.indexOf(oldInfo.rangeEndContainer.textContent.slice(0,oldInfo.rangeEndOffset))>-1){
                sonNode.childNodes.forEach((grandSonNode) => {
                    const index =  grandSonNode.textContent.indexOf(oldInfo.rangeEndContainer.textContent.slice(0,oldInfo.rangeEndOffset));
                    if( index > -1){
                        newRange.setStart(grandSonNode, oldInfo.rangeEndOffset + index);
                        newRangePriority[3] = newRange;
                    }
                })
            }
            else{// 父不包含，子包含
                sonNode.childNodes.forEach((grandSonNode) => {
                    const index =  grandSonNode.textContent.indexOf(oldInfo.rangeEndContainer.textContent);
                    const currentParentLocation = grandSonNode.parentElement.getBoundingClientRect();
                    const currentDistance = (currentParentLocation.top - parentRect.top)*parentRect.width + (currentParentLocation.left - parentRect.left);
                    if( index > -1 && currentDistance <= oldDistance && currentDistance> sonDistance){
                        newRange.setStart(grandSonNode, oldInfo.rangeEndOffset + index);
                        newRangePriority[4] = newRange;
                        sonDistance = currentDistance;
                    }else {
                        // diff假设只修改一处地方
                        const diffdata = tmp.diff_main( oldInfo.rangeEndContainer.textContent.slice(0,oldInfo.rangeEndOffset), grandSonNode.textContent,true);
                        //console.log(diffdata);
                        //比较相同的地方
                        let currentEqualCharsSum = 0;
                        let offset = oldInfo.rangeEndOffset;
                        diffdata.forEach((df,index) => {
                            if(df[0] === 0){
                                currentEqualCharsSum += df[1].length;
                            }else if(df[0] === -1){
                                offset -= df[1].length;
                            }else if(df[0] === 1 && index < diffdata.length-1){
                                offset += df[1].length;
                            }
                            //console.log(df, offset);
                        });
                        if(currentEqualCharsSum > equalCharsSum){
                            //console.log(grandSonNode.textContent, offset);
                            newRange.setStart(grandSonNode, offset);
                            newRangePriority[5] = newRange;
                            equalCharsSum = currentEqualCharsSum;
                        }else if(currentDistance <= oldDistance && currentDistance> noneDistance){ // 父不包含，子也不包含,比较比较距离
                            newRange.setStart(grandSonNode, grandSonNode.textContent.length);
                            newRangePriority[6] = newRange;
                            noneDistance = currentDistance;
                        }
                    }
                })
            }
        })
    }
    for(const NR_index in newRangePriority){
        console.log("NR INDEX",NR_index);
        const NR = newRangePriority[NR_index];
        if(NR instanceof Range){
            NR.collapse(true);
            setSelectionFocus(NR);
            return;
        }
    }
}

export const getCursorPosition = (editor: HTMLElement) => {
    const range = window.getSelection().getRangeAt(0);
    if (!editor.contains(range.startContainer) && !hasClosestByClassName(range.startContainer, "vditor-panel--none")) {
        return {
            left: 0,
            top: 0,
        };
    }
    const parentRect = editor.parentElement.getBoundingClientRect();
    let cursorRect;
    if (range.getClientRects().length === 0) {
        if (range.startContainer.nodeType === 3) {
            // 空行时，会出现没有 br 的情况，需要根据父元素 <p> 获取位置信息
            const parent = range.startContainer.parentElement;
            if (parent && parent.getClientRects().length > 0) {
                cursorRect = parent.getClientRects()[0];
            } else {
                return {
                    left: 0,
                    top: 0,
                };
            }
        } else {
            const children = (range.startContainer as Element).children;
            if (children[range.startOffset] &&
                children[range.startOffset].getClientRects().length > 0) {
                // markdown 模式回车
                cursorRect = children[range.startOffset].getClientRects()[0];
            } else if (range.startContainer.childNodes.length > 0) {
                // in table or code block
                const cloneRange = range.cloneRange();
                range.selectNode(range.startContainer.childNodes[Math.max(0, range.startOffset - 1)]);
                cursorRect = range.getClientRects()[0];
                range.setEnd(cloneRange.endContainer, cloneRange.endOffset);
                range.setStart(cloneRange.startContainer, cloneRange.startOffset);
            } else {
                cursorRect = (range.startContainer as HTMLElement).getClientRects()[0];
            }
            if (!cursorRect) {
                let parentElement = range.startContainer.childNodes[range.startOffset] as HTMLElement;
                while (!parentElement.getClientRects ||
                (parentElement.getClientRects && parentElement.getClientRects().length === 0)) {
                    parentElement = parentElement.parentElement;
                }
                cursorRect = parentElement.getClientRects()[0];
            }
        }

    } else {
        cursorRect = range.getClientRects()[0];
    }

    return {
        left: cursorRect.left - parentRect.left,
        top: cursorRect.top - parentRect.top,
    };
};

export const selectIsEditor = (editor: HTMLElement, range?: Range) => {
    if (!range) {
        if (getSelection().rangeCount === 0) {
            return false;
        } else {
            range = getSelection().getRangeAt(0);
        }
    }
    const container = range.commonAncestorContainer;

    return editor.isEqualNode(container) || editor.contains(container);
};

export const setSelectionFocus = (range: Range) => {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
};

export const getSelectPosition = (selectElement: HTMLElement, editorElement: HTMLElement, range?: Range) => {
    const position = {
        end: 0,
        start: 0,
    };

    if (!range) {
        if (getSelection().rangeCount === 0) {
            return position;
        }
        range = window.getSelection().getRangeAt(0);
    }

    if (selectIsEditor(editorElement, range)) {
        const preSelectionRange = range.cloneRange();
        if (selectElement.childNodes[0] && selectElement.childNodes[0].childNodes[0]) {
            preSelectionRange.setStart(selectElement.childNodes[0].childNodes[0], 0);
        } else {
            preSelectionRange.selectNodeContents(selectElement);
        }
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        position.start = preSelectionRange.toString().length;
        position.end = position.start + range.toString().length;
    }
    return position;
};

export const setSelectionByPosition = (start: number, end: number, editor: HTMLElement) => {
    let charIndex = 0;
    let line = 0;
    let pNode = editor.childNodes[line];
    let foundStart = false;
    let stop = false;
    start = Math.max(0, start);
    end = Math.max(0, end);

    const range = editor.ownerDocument.createRange();
    range.setStart(pNode || editor, 0);
    range.collapse(true);

    while (!stop && pNode) {
        const nextCharIndex = charIndex + pNode.textContent.length;
        if (!foundStart && start >= charIndex && start <= nextCharIndex) {
            if (start === 0) {
                range.setStart(pNode, 0);
            } else {
                if (pNode.childNodes[0].nodeType === 3) {
                    range.setStart(pNode.childNodes[0], start - charIndex);
                } else if (pNode.nextSibling) {
                    range.setStartBefore(pNode.nextSibling);
                } else {
                    range.setStartAfter(pNode);
                }
            }
            foundStart = true;
            if (start === end) {
                stop = true;
                break;
            }
        }
        if (foundStart && end >= charIndex && end <= nextCharIndex) {
            if (end === 0) {
                range.setEnd(pNode, 0);
            } else {
                if (pNode.childNodes[0].nodeType === 3) {
                    range.setEnd(pNode.childNodes[0], end - charIndex);
                } else if (pNode.nextSibling) {
                    range.setEndBefore(pNode.nextSibling);
                } else {
                    range.setEndAfter(pNode);
                }
            }
            stop = true;
        }
        charIndex = nextCharIndex;
        pNode = editor.childNodes[++line];
    }

    if (!stop && editor.childNodes[line - 1]) {
        range.setStartBefore(editor.childNodes[line - 1]);
    }

    setSelectionFocus(range);
    return range;
};

export const setRangeByWbr = (element: HTMLElement, range: Range) => {
    const wbrElement = element.querySelector("wbr");
    if (!wbrElement) {
        return;
    }
    if (!wbrElement.previousElementSibling) {
        if (wbrElement.previousSibling) {
            // text<wbr>
            range.setStart(wbrElement.previousSibling, wbrElement.previousSibling.textContent.length);
        } else if (wbrElement.nextSibling) {
            if (wbrElement.nextSibling.nodeType === 3) {
                // <wbr>text
                range.setStart(wbrElement.nextSibling, 0);
            } else {
                // <wbr><br> https://github.com/Vanessa219/vditor/issues/400
                range.setStartBefore(wbrElement.nextSibling);
            }
        } else {
            // 内容为空
            range.setStart(wbrElement.parentElement, 0);
        }
    } else {
        if (wbrElement.previousElementSibling.isSameNode(wbrElement.previousSibling)) {
            if (wbrElement.previousElementSibling.lastChild) {
                // <em>text</em><wbr>
                range.setStartBefore(wbrElement);
                range.collapse(true);
                setSelectionFocus(range);
                // fix Chrome set range bug: **c**
                if (isChrome() && (wbrElement.previousElementSibling.tagName === "EM" ||
                    wbrElement.previousElementSibling.tagName === "STRONG" ||
                    wbrElement.previousElementSibling.tagName === "S")) {
                    range.insertNode(document.createTextNode(Constants.ZWSP));
                    range.collapse(false);
                }
                wbrElement.remove();
                return;
            } else {
                // <br><wbr>
                range.setStartAfter(wbrElement.previousElementSibling);
            }
        } else {
            // <em>text</em>text<wbr>
            range.setStart(wbrElement.previousSibling, wbrElement.previousSibling.textContent.length);
        }
    }
    range.collapse(true);
    wbrElement.remove();
    setSelectionFocus(range);
};

export const insertHTML = (html: string, vditor: IVditor) => {
    // 使用 lute 方法会添加 p 元素，只有一个 p 元素的时候进行删除
    const tempElement = document.createElement("div");
    tempElement.innerHTML = html;
    const tempBlockElement = tempElement.querySelectorAll("p");
    if (tempBlockElement.length === 1 && !tempBlockElement[0].previousSibling && !tempBlockElement[0].nextSibling &&
        vditor[vditor.currentMode].element.children.length > 0 && tempElement.firstElementChild.tagName === "P") {
        html = tempBlockElement[0].innerHTML.trim();
    }

    const pasteElement = document.createElement("div");
    pasteElement.innerHTML = html;

    const range = getEditorRange(vditor[vditor.currentMode].element);
    if (range.toString() !== "") {
        vditor[vditor.currentMode].preventInput = true;
        document.execCommand("delete", false, "");
    }

    if (pasteElement.firstElementChild &&
        pasteElement.firstElementChild.getAttribute("data-block") === "0") {
        // 粘贴内容为块元素时，应在下一段落中插入
        pasteElement.lastElementChild.insertAdjacentHTML("beforeend", "<wbr>");
        const blockElement = hasClosestBlock(range.startContainer);
        if (!blockElement) {
            vditor[vditor.currentMode].element.insertAdjacentHTML("beforeend", pasteElement.innerHTML);
        } else {
            blockElement.insertAdjacentHTML("afterend", pasteElement.innerHTML);
        }
        setRangeByWbr(vditor[vditor.currentMode].element, range);
    } else {
        const pasteTemplate = document.createElement("template");
        pasteTemplate.innerHTML = html;
        range.insertNode(pasteTemplate.content.cloneNode(true));
        range.collapse(false);
        setSelectionFocus(range);
    }
};
