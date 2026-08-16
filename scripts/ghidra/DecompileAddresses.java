// Decompile the functions containing supplied hexadecimal addresses.
// @category Paldeck

import java.io.File;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Set;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.ReferenceIterator;

public class DecompileAddresses extends GhidraScript {
	@Override
	public void run() throws Exception {
		if (getScriptArgs().length < 2) {
			throw new IllegalArgumentException("Expected output file and at least one address.");
		}
		Set<Function> functions = new LinkedHashSet<>();
		for (int index = 1; index < getScriptArgs().length; index += 1) {
			Address address = toAddr(getScriptArgs()[index].replace("0x", ""));
			Function function = currentProgram.getFunctionManager().getFunctionContaining(address);
			if (function != null) {
				functions.add(function);
			}
		}
		Set<Function> expanded = new LinkedHashSet<>(functions);
		for (Function function : functions) {
			ReferenceIterator references = currentProgram.getReferenceManager().getReferencesTo(function.getEntryPoint());
			while (references.hasNext()) {
				Function caller = currentProgram.getFunctionManager().getFunctionContaining(references.next().getFromAddress());
				if (caller != null) {
					expanded.add(caller);
				}
			}
		}
		DecompInterface decompiler = new DecompInterface();
		decompiler.openProgram(currentProgram);
		try (PrintWriter writer = new PrintWriter(new File(getScriptArgs()[0]), StandardCharsets.UTF_8)) {
			for (Function function : expanded) {
				writer.printf("%n## %s @ %s body=%s%n", function.getName(), function.getEntryPoint(), function.getBody());
				DecompileResults result = decompiler.decompileFunction(function, 600, monitor);
				writer.println(result.decompileCompleted() ? result.getDecompiledFunction().getC() : "DECOMPILE FAILED: " + result.getErrorMessage());
			}
		}
		decompiler.dispose();
	}
}
