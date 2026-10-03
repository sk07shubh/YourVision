import type{ReactNode,ComponentType}from"react";
import type{TraceState}from"../types/trace";
import type{VisualizationModule}from"./core/module";
import{stackVisualizationModule}from"./stack/module";
import{queueVisualizationModule}from"./queue/module";
import{linkedListVisualizationModule}from"./linked-list/module";
import{dequeVisualizationModule}from"./deque/module";
import{treeVisualizationModule}from"./tree/module";
import{heapVisualizationModule}from"./heap/module";
import{mapModule}from"./map/module";
import{setModule}from"./set/module";
import{trieModule}from"./trie/module";
import{matrixVisualizationModule}from"./matrix/module";
import{graphVisualizationModule}from"./graph/module";
import{StackScene}from"./stack/StackScene";
import{QueueScene}from"./queue/QueueScene";
import{LinkedListScene}from"./linked-list/LinkedListScene";
import{DequeScene}from"./deque/DequeScene";
import{TreeScene}from"./tree/TreeScene";
import{HeapScene}from"./heap/HeapScene";
import{MapScene}from"./map/MapScene";
import{SetScene}from"./set/SetScene";
import{TrieScene}from"./trie/TrieScene";
import{MatrixScene}from"./matrix/MatrixScene";
import{GraphScene}from"./graph/GraphScene";
import"./matrix/matrix-scene.css";
import"./graph/graph-scene.css";

interface VisualizationContext{state:TraceState;previous?:TraceState}
interface VisualizationPipeline{ id:string; render(context:VisualizationContext):ReactNode }

function pipeline<E,S extends unknown[]>(
  module:VisualizationModule<E,S>,
  View:ComponentType<{scene:S;events:E[]}>
):VisualizationPipeline{
  return{
    id:module.id,
    render({state,previous}){
      const scene=module.createScene(state,undefined,previous);
      const events=module.compileEvents(state,previous);
      const presented=module.presentScene(scene,events);
      if(Array.isArray(presented)&&presented.length===0)return null;
      return <View scene={presented} events={events}/>;
    }
  };
}

export const visualizationRegistry:VisualizationPipeline[]=[
  pipeline(stackVisualizationModule,StackScene),
  pipeline(queueVisualizationModule,QueueScene),
  pipeline(linkedListVisualizationModule,LinkedListScene),
  pipeline(dequeVisualizationModule,DequeScene),
  pipeline(treeVisualizationModule,TreeScene),
  pipeline(heapVisualizationModule,HeapScene),
  pipeline(mapModule,MapScene),
  pipeline(setModule,SetScene),
  pipeline(trieModule,TrieScene),
  pipeline(matrixVisualizationModule,MatrixScene),
  pipeline(graphVisualizationModule,GraphScene)
];
