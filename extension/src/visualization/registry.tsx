import type{ReactNode,ComponentType}from"react";
import type{TraceState}from"../types/trace";
import{createStackScene}from"./stack/scene";
import{compileStackEvents}from"./stack/compiler";
import{presentStackScene}from"./stack/presentation";
import{StackScene}from"./stack/StackScene";
import{createQueueScene}from"./queue/scene";
import{compileQueueEvents}from"./queue/compiler";
import{presentQueueScene}from"./queue/presentation";
import{QueueScene}from"./queue/QueueScene";
import{createLinkedListScene}from"./linked-list/scene";
import{compileLinkedListEvents}from"./linked-list/compiler";
import{presentLinkedListScene}from"./linked-list/presentation";
import{LinkedListScene}from"./linked-list/LinkedListScene";
import{createDequeScene}from"./deque/scene";
import{compileDequeEvents}from"./deque/compiler";
import{presentDequeScene}from"./deque/presentation";
import{DequeScene}from"./deque/DequeScene";
import{createTreeScene}from"./tree/scene";
import{compileTreeEvents}from"./tree/compiler";
import{presentTreeScene}from"./tree/presentation";
import{TreeScene}from"./tree/TreeScene";
import{createHeapScene}from"./heap/scene";
import{compileHeapEvents}from"./heap/compiler";
import{presentHeapScene}from"./heap/presentation";
import{HeapScene}from"./heap/HeapScene";
import{createMapScene}from"./map/scene";
import{compileMapEvents}from"./map/compiler";
import{presentMapScene}from"./map/presentation";
import{MapScene}from"./map/MapScene";
import{createSetScene}from"./set/scene";
import{compileSetEvents}from"./set/compiler";
import{presentSetScene}from"./set/presentation";
import{SetScene}from"./set/SetScene";
import{createTrieScene}from"./trie/scene";
import{compileTrieEvents}from"./trie/compiler";
import{presentTrieScene}from"./trie/presentation";
import{TrieScene}from"./trie/TrieScene";
import{createMatrixScene}from"./matrix/scene";
import{compileMatrixEvents}from"./matrix/compiler";
import{presentMatrixScene}from"./matrix/presentation";
import{MatrixScene}from"./matrix/MatrixScene";
import{createGraphScene}from"./graph/scene";
import{compileGraphEvents}from"./graph/compiler";
import{presentGraphScene}from"./graph/presentation";
import{GraphScene}from"./graph/GraphScene";
import"./matrix/matrix-scene.css";
import"./graph/graph-scene.css";

interface VisualizationContext{state:TraceState;previous?:TraceState}
interface VisualizationPipeline<S,E>{id:string;render(context:VisualizationContext):ReactNode}

function pipeline<S,E>(
  id:string,
  create:(state:TraceState)=>S[],
  compile:(state:TraceState,previous?:TraceState)=>E[],
  present:(scene:S[],events:E[])=>S[],
  View:ComponentType<{scene:S[];events:E[]}>
):VisualizationPipeline<S,E>{
  return{
    id,
    render({state,previous}){
      const scenes=create(state);
      if(scenes.length===0)return null;
      const events=compile(state,previous);
      const presented=present(scenes,events);
      return <View scene={presented} events={events}/>;
    }
  };
}

export const visualizationRegistry:VisualizationPipeline<unknown,unknown>[]=[
  pipeline("stack",createStackScene,compileStackEvents,presentStackScene,StackScene),
  pipeline("queue",createQueueScene,compileQueueEvents,presentQueueScene,QueueScene),
  pipeline("linked-list",createLinkedListScene,compileLinkedListEvents,presentLinkedListScene,LinkedListScene),
  pipeline("deque",createDequeScene,compileDequeEvents,presentDequeScene,DequeScene),
  pipeline("tree",createTreeScene,compileTreeEvents,presentTreeScene,TreeScene),
  pipeline("heap",createHeapScene,compileHeapEvents,presentHeapScene,HeapScene),
  pipeline("map",createMapScene,compileMapEvents,presentMapScene,MapScene),
  pipeline("set",createSetScene,compileSetEvents,presentSetScene,SetScene),
  pipeline("trie",createTrieScene,compileTrieEvents,presentTrieScene,TrieScene),
  pipeline("matrix",createMatrixScene,compileMatrixEvents,presentMatrixScene,MatrixScene),
  pipeline("graph",createGraphScene,compileGraphEvents,presentGraphScene,GraphScene)
];
