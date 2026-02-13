import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chat } from "./Chat";
import "./index.css";

export function App() {
  return (
    <div className="container mx-auto p-8 relative z-10 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center">
            찐만두
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Chat />
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
