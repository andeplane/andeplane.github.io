import Course from "./labs/app/page";
import "./labs/labs.css";
import "katex/dist/katex.min.css";
export default function Labs() {
  return (
    <div className="no-labs">
      <Course />
    </div>
  );
}
